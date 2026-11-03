# Core System Logic & Architecture Specification

> Extracted from the live codebase for functional edge-case, credit-leakage, and architectural review.
> All references are `file:line` against the current working tree.

---

## 1. Order Lifecycle & State Machine

### 1.1 Supported statuses

Canonical enum (single source of truth): `src/lib/types.ts:1-11`

```
PENDING → CONFIRMED → PROCESSING → READY → SHIPPED → DELIVERED
                                                   ↘ CANCELLED
```

- **DB column**: plain `text`, default `"PENDING"` — no Drizzle enum (`src/db/schema.ts:249-251`).
- **DB CHECK**: `orders_status_check` added by `supabase/migrations/0019_normalize_order_status.sql:40-65`, but **conditionally skipped** if any legacy row remains → enforcement is not guaranteed.
- **Legacy aliases normalized in code** (`src/lib/order-state-machine.ts:34-44`): `PREPARING→PROCESSING`, `COMPLETED→DELIVERED`; unknown → `null` (`:51-56`).
- Adjacent state machines: `paymentStatus` (`unpaid|paid|refunded`, `schema.ts:254`), `shippingStatus` (carrier-side, `schema.ts:282`, default `UNFULFILLED`), `codVerificationStatus` (`NOT_REQUIRED|PENDING_VERIFICATION|VERIFIED|EXPIRED`, `schema.ts:259-261`).

### 1.2 Allowed transitions

`src/lib/order-state-machine.ts:16-24`

| From | Allowed to |
|---|---|
| `PENDING` | `CONFIRMED`, `CANCELLED` |
| `CONFIRMED` | `PROCESSING`, `CANCELLED` |
| `PROCESSING` | `READY` |
| `READY` | `SHIPPED` |
| `SHIPPED` | `DELIVERED` |
| `DELIVERED` | *(terminal)* |
| `CANCELLED` | *(terminal, except admin override → `DELIVERED`)* |

Validation (`isValidTransition`, `order-state-machine.ts:110-130`):
1. Unknown target status → `false`.
2. `from === to` → `true` (idempotent no-op).
3. Matrix lookup.
4. Sole override edge: `isAdminOverride && CANCELLED → DELIVERED`.

Guards/roles:
- `canManageOrders(role)` → `OWNER || STAFF_MANAGE_ORDERS` (`:176-178`).
- `hasAdminOverride(role)` → `OWNER` only (`:185-187`).
- `validateStoreAccess(orderStoreId, sessionStoreId)` (`:164-169`).
- `isTerminalStatus` → `DELIVERED | CANCELLED` (`:154-156`).

### 1.3 Entry points and who may do what

| Entry point | Actor | Transition guard | Restock | Audit log |
|---|---|---|---|---|
| `PATCH /api/orders` (`api/orders/route.ts:267-415`) | session + `canManageOrders` (`:275`) | **OWNER bypasses matrix entirely** (`!isAdmin && !isValidTransition(...)` `:343-349`) | **no** | in-tx (`:363-373`) |
| `PATCH /api/orders/[id]` (`api/orders/[id]/route.ts:24-154`) | same RBAC | `isValidTransition(prev, target, isAdmin)` (`:99-102`) — OWNER gets only the `CANCELLED→DELIVERED` edge | **no** | in-tx (`:116-126`) |
| `POST /api/orders/cancel` (`api/orders/cancel/route.ts:10-139`) | **no auth** — tenant proof = `{orderId, storeSlug}` (`:12-36`) | `isValidTransition(prev,"CANCELLED")` (`:66-71`) → `PENDING` or `CONFIRMED`; idempotent short-circuit at `:57-59` | **yes** (`:80-87`) | in-tx (`:101-111`) |
| COD decision (`lib/orders/cod-verification.ts:284-404`) | public link + mandatory `store_slug` (`verify-cod/route.ts:58-82`), 20 req/min | Confirm: **no matrix call** — only `PENDING→CONFIRMED` else unchanged (`:317-328`). Cancel: matrix (`:349-358`) | **yes on cancel** (`:360-370`) | post-commit best-effort (`:386-401`) |
| Stripe webhook (`api/webhooks/stripe/route.ts:96-181`) | system | `PENDING→CONFIRMED` when `paymentStatus="paid"`; check at `:125` is **tautological** (hardcoded literals); real guard = outer `normalizedStatus === "PENDING"` (`:124`) | no | 2 conditional rows in-tx (`:145-166`) |
| Carrier webhook (`lib/shipping-status-sync.ts:74-186`) | HMAC-optional | **No state-machine check** — rank guard on `shippingStatus` only (`:94-103`); `DELIVERED` forces `status="DELIVERED"` **and `paymentStatus="paid"`** (`:110-119`) → allows `PENDING→DELIVERED` | no | post-commit best-effort (`:146-159`) |
| Bulk `markShipped` (`api/shipping/route.ts:465-483`) | session + owned store (no `canManageOrders`) | **none** — unconditional `status:"SHIPPED"` (`:472`) | no | **none** |
| `bookOrder` (`lib/shipping-fulfillment.ts:100-193`) | session + owned store | **none** — any non-terminal → `"SHIPPED"` (`:144-160`) | no | post-commit best-effort (`:165-178`) |
| POS create (`api/pos/route.ts:160-176`) | session | bypass: inserts `DELIVERED` + `paid` directly (`:171-173`) | n/a (decrements `:191-199`) | none |

Order creation (online) always inserts `PENDING` (`api/orders/route.ts:210`, `api/checkout/route.ts:253,361,404`).

### 1.4 Side effects triggered per transition

**In-transaction (rollback-safe):**
- Row lock `SELECT … FOR UPDATE` — `orders/route.ts:326-331`, `[id]/route.ts:83-88`, `cancel/route.ts:41-46`, `cod-verification.ts:291-297`, `webhooks/stripe/route.ts:109`, `shipping-status-sync.ts:77-83`.
- `orderStatusLogs` audit rows (IP from `x-forwarded-for`, `changedByUserId`).
- Inventory restock on cancel: `products.stock = stock + qty` (`cancel/route.ts:80-87`, `cod-verification.ts:360-370`) — **only these two paths**.
- Status + `paymentStatus` mutation.

**Post-commit / fire-and-forget (best-effort, `try/catch`ed):**
- `revalidatePath("/dashboard")`, `/dashboard/orders`.
- `broadcastOrderUpdate` (Supabase broadcast, `realtime.ts:296-327`) — **has no subscriber** (dashboard listens to `postgres_changes` only, `realtime.ts:174-221`).
- Delivery WhatsApp receipt on `DELIVERED`: `shipping-status-sync.ts:175-177 → notifyDelivery()` (`:189-218`).

**Alerts (WhatsApp, metered):**
- COD verification on create: `api/orders/route.ts:242-257`, `api/checkout/route.ts:426-450` — explicit *"a WhatsApp outage must never break checkout"*; `PaywallError` → `console.warn`.
- COD resend: `api/orders/resend-verification/route.ts:170-220` (granular 402/503/400 mapping).
- **No SMS/email infrastructure exists.** Desktop `Notification` (`lib/notifications.ts`) fires only on new `PENDING` insert (`dashboard/layout.tsx:173-196`), never on transitions.

**Not tied to transitions:**
- Loyalty points awarded at checkout/creation only (`checkout/route.ts:301,377,423` → `finalizeCheckoutLoyalty`, body in `try` at `loyalty-server.ts:153`) — **never clawed back on CANCELLED**.
- Metrics are read-side predicates only (`order-metrics.ts:24-44`: revenue = `DELIVERED|COMPLETED` **and** `payment_status='paid'`).
- **No outbound webhook dispatcher exists** (only inbound Stripe/carrier/WhatsApp/social).

### 1.5 `order-status-sql.ts` clarification

Not a transition function — query predicate helpers (`import "server-only"`):
```ts
orderStatusIs(col, s)    // upper(col) IN variants(s)      (:18-21)
orderStatusIn(col, arr)  // (:23-32)   orderStatusNotIn (:34-43)
```
Variants (`order-state-machine.ts:63-74`): `DELIVERED→[DELIVERED,COMPLETED]`, `PROCESSING→[PROCESSING,PREPARING]`. Always paired with `store_id` filter (index note `:14-15`).

### 1.6 Architectural flaws identified

1. **Inconsistent override semantics** — collection route lets OWNER do any transition; by-id route does not (`orders/route.ts:343-349` vs `[id]/route.ts:99-102`).
2. **Shipping paths ignore the state machine** — bulk `markShipped` has *no audit log at all*; `bookOrder` lets `PENDING→SHIPPED` skip 3 states.
3. **Carrier webhook mutates payment state** with no machine check; guarded only by a non-unique `tracking_number` index (`schema.ts:288`) and an HMAC that is **skipped when no secret is configured** (`api/shipping/webhook/route.ts:137-143`) → forged `DELIVERED` = forged revenue.
4. **Restock asymmetry** — dashboard `PATCH … status=CANCELLED` does **not** restock; customer/COD cancel does. `warehouse_stock` is **never** restored (deducted at `warehouses-server.ts:80-126`) → permanent inventory drift. Restock is unguarded `+qty` even though decrement was `gte`-guarded (`warehouses-server.ts:112-122`) → can credit stock never deducted.
5. **Cancel error copy lies**: message says "Only pending orders can be cancelled" but the check also permits `CONFIRMED → CANCELLED` (`cancel/route.ts:63-65,132` vs `:66-71`).
6. **Idempotency `from===to` writes a no-op audit row** on both PATCH routes.
7. **COD confirm path never calls `isValidTransition`** (`cod-verification.ts:317-326`).
8. **Legacy-cased literals in risk engine** — `risk-engine.ts:103-105` counts `'Completed'/'Cancelled'` which post-0019 never match → risk history counts zero completed/cancelled and overcounts "unverified".
9. **RBAC/tenant mismatch** — staff pass `canManageOrders` but every route resolves store via `stores.ownerId = session.id` → staff get 404 `STORE_NOT_FOUND`. Conversely `/api/shipping/*` never calls `canManageOrders`, and `/api/orders/cancel` requires **no session at all**.
10. **Unauthenticated cancel returns the full order row (PII)** (`cancel/route.ts:120`).
11. **Tracking step map has no `CANCELLED` key** → falls back to step 0 (`order-tracking.ts:59-72`).
12. **No `payment_status='refunded'` writer exists anywhere** despite the DB CHECK.

---

## 2. Billing, Credits, and Paywall Architecture

### 2.1 Schema

**Tenant = `stores` row** (there is no `tenants`/`subscriptions` table).

`src/db/schema.ts:45-68`:
```ts
plan: text("plan").notNull().default("free"),
aiCredits:      integer("ai_credits").notNull().default(50),
whatsappCredits:integer("whatsapp_credits").notNull().default(0),
hasWhiteLabel / maxStaffSeats,
planExpiresAt, aiCreditsExpiresAt, waCreditsExpiresAt  // default now() + 30 days
```
- **No `CHECK (>= 0)`** on either balance — negativity is prevented only by the application's `WHERE col >= cost` predicate.
- `CREDIT_VALIDITY_DAYS = 30` (`billing-packages.ts:137`).

Ledger `store_credits` (`schema.ts:690-716`): `{storeId, creditType: "ai"|"whatsapp", amount (+/-), balanceAfter, description, createdAt}` — **append-only, insert-only, never read anywhere**; no idempotency/dedup key, no FK to a request or webhook event.

Vouchers: `activation_codes` (`schema.ts:104-125`, `code` unique, `isUsed`, `usedByStoreId`). Add-ons: `store_add_ons` (`schema.ts:629-658`, **no expiry column**).

### 2.2 Deduction sequence

Core helper `deductCredits` (`src/lib/paywall.ts:264-350`):

1. Validate: non-UUID → `PaywallError("STORE_NOT_FOUND",404)`; non-positive-integer cost → `INVALID_COST,400` (`:271-280`).
2. **Expiry pre-check — separate SELECT** (`:287-305`): reads `*_expires_at`; past → `CREDITS_EXPIRED,402`. If the column is missing (migration not applied), this block is swallowed → balance-only metering.
3. **Atomic conditional UPDATE** (`:307-319`):
   ```sql
   UPDATE stores SET <col> = <col> - $cost
   WHERE id = $storeId AND <col> >= $cost
   RETURNING <col>
   ```
   → one statement, Postgres row lock, concurrent deductions serialize, cannot go negative.
4. Zero rows → re-read to diagnose: missing store 404 / expired 402 / else `<TYPE>_CREDITS_EXHAUSTED` **HTTP 402** (`:328-349`).
5. **Missing balance column → `return null` → caller treats store as *unmetered* (fail-open)** (`:320-326`).

### 2.3 Transaction sequence per channel

**WhatsApp — canonical metered dispatcher `sendMeteredWhatsApp` (`paywall.ts:472-538`):**
```
1. db.transaction { deductCredits(...) + INSERT store_credits }   ← committed BEFORE send   (:482-500)
2. result = await send()                                          ← provider call           (:511)
   on throw → refundWhatsAppCredits(...)                          (:514)
3. delivered = options.isDelivered(result) || detectDelivery(result)  (:516-521)
   if !delivered → refund + return {delivered:false, refunded:true}   (:523-535)
```
- **Deduct-before-send** → a provider outage cannot produce a free send.
- Refund helper (`:422-453`): own transaction (`balance += cost` + ledger row `Refund: …`), but **catches all errors, logs `console.warn`, returns `null`** → best-effort, and **unconditional `+cost` with no idempotency key**.
- Schema missing → `creditsRemaining = null` → send proceeds **unmetered** (`:504-507`).

**AI — `canUseAICredits` then call then ledger (no refund):**
```ts
// api/ai/description/route.ts:54,65,67  (same shape in insights:87,105 / marketing:77,96)
creditsRemaining = await canUseAICredits(storeId, 1);   // deduct, autocommit
const result = await generateProductDescription(...);  // external API
await recordCreditUsage(storeId, "ai", 1, creditsRemaining, "…");  // separate INSERT
```
- Two autocommit statements on **different pool connections** → not atomic; crash between them = **balance decremented with no ledger row**.
- `recordCreditUsage` swallows its own errors (`paywall.ts:751-753`); `balanceAfter` is a snapshot from a different statement (stale/out-of-order under concurrency).
- **There is no AI refund path anywhere.** Worse, `src/lib/ai.ts` never throws — `complete()` returns `null` (`:89,:96,:104`) and generators fall back to canned mock text (`:141-145`) ⇒ **credits are consumed for OpenAI outages, missing API keys, and mock output**.

**Grant (top-up):** `grantCredits` = `UPDATE stores SET col = col + n` then separate `INSERT store_credits` with ledger error swallowed (`paywall.ts:698-721`, *"never fail a purchase on a ledger miss"*).

### 2.4 Atomicity matrix

| Operation | Mechanism | Atomic? |
|---|---|---|
| Deduct balance | single conditional `UPDATE … RETURNING` | ✅ |
| WA deduct + ledger | one `db.transaction` | ✅ |
| AI deduct + ledger | 2 separate autocommits | ❌ |
| Grant | UPDATE + separate INSERT (ledger error swallowed) | ❌ |
| Refund | own transaction | ✅ per-call, **not idempotent** |
| Voucher claim | `UPDATE … WHERE is_used=false RETURNING` in tx | ✅ (claim alone) |
| **Voucher claim + grant** | claim in `tx`, `grantCredits()` runs on module-level `db` (`redeem-code/route.ts:74,130` vs `paywall.ts:698`) | ❌ **grant outside tx** |
| Add-on activation + voucher | `upsertAddOn()` uses global `db` + SELECT-then-INSERT (`activate-addon/route.ts:83-131`) | ❌ |

No `SELECT … FOR UPDATE` on `stores` credit rows anywhere (`.for("update")` appears only on `orders`). No optimistic versioning. All txs default READ COMMITTED.

### 2.5 Refund guarantees on failure

- **WhatsApp:** deduction is already committed when `send()` runs. A crash between commit and `send()`, during `send()`, or before the refund **permanently loses the credit** — no outbox, no retry queue, no reconciliation job. The refund itself is best-effort (`console.warn`, `return null`, `paywall.ts:449-452`) and non-idempotent (a double-call would `+cost` twice; latent today).
- **AI:** **no refund at all.**

### 2.6 Paywall enforcement

**Two layers:**
1. **Middleware pre-gate (read-only)** — `src/proxy.ts:195-211` + `API_FEATURE_GATES` (`paywall.ts:818-821`): `/api/ai/*` → `ai_credits`, `/api/whatsapp/*` → `whatsapp_credits`. `resolveApiFeatureGate` (`:839-900`) returns 402 (`CREDITS_EXPIRED` / `*_CREDITS_EXHAUSTED`) but **never deducts**. Note `/api/whatsapp/*` matches **no existing route** → that half is a no-op.
2. **Handler-level atomic deduction** (authoritative): `canUseAICredits` in the 3 AI routes; `sendMeteredWhatsApp` in all 5 WhatsApp send paths (checkout, orders, resend-verification, shipping-status-sync, social webhook).

**Plan quotas** — `api/products/route.ts:97-124`: `effectivePlan()` (expired `pro` falls back to `free`, `plans.ts:43-49`), `productLimitFor(plan)` (free 15 / pro ∞) → 402 `PRODUCT_LIMIT_REACHED`.

**Error → HTTP map:** `*_CREDITS_EXHAUSTED` 402 · `CREDITS_EXPIRED` 402 · `PLAN_EXPIRED` 402 · `PRODUCT_LIMIT_REACHED` 402 · `PAYMENT_REQUIRED` 402 · `STORE_NOT_FOUND` 404 · `INVALID_COST` 400. Default `PaywallError.status = 402` (`paywall.ts:47`).

**Degrade-not-500 call sites:** `checkout/route.ts:441-450`, `orders/route.ts:250-256`, `shipping-status-sync.ts:209-216`, `webhooks/social/route.ts:426-431` (`meteredSocialSend` converts `PaywallError` → `{delivered:false}` so the webhook returns 200 and is not retried).

**Stripe webhook grants no credits** — it handles order payment + Connect only (`webhooks/stripe/route.ts`); `grep grantCredits` → one call site: `redeem-code/route.ts:130`. All credit granting is voucher-based; `POST /api/billing/credits` hard-returns 402 (`credits/route.ts:14-30`). No `stripe_events`/event-id ledger exists → idempotency relies on status guards (`PENDING` no longer matches on replay).

### 2.7 Credit leakage & paywall flaws (ranked)

1. **Voucher claim and credit grant in different transactions** → rollback/crash after grant leaves the code redeemable again (free credits / double-spend) — `redeem-code/route.ts:74,130`.
2. **AI deduction + ledger non-atomic; no refund; mock fallbacks are billed** → user pays 1 credit for an outage/missing key/canned text.
3. **Refund not crash-safe, best-effort, non-idempotent** → WA credit loss on crash; `store_credits` has no dedup key.
4. **Fail-open metering** — missing column/migration ⇒ unlimited free usage instead of 503 (`paywall.ts:320-326`, `:504-507`, degraded `getStoreEntitlements` reports `planActive:true` + 50 credits `:194-219`).
5. **Plan/add-on server gates are dead code** — `requireActivePlan`, `hasFeatureAccess`, `hasCredits`, `canUseWhatsAppCredits`, `isPaidPlanActive` have **zero external call sites**; `active_plan` branch of `resolveApiFeatureGate` is unreachable (`paywall.ts:887-897`).
6. **Add-ons are free & permanent** — `POST /api/billing/addons` has *"mock billing: no payment provider attached"* (`addons/route.ts:27-29`) and flips `hasWhiteLabel`/`maxStaffSeats` with no payment; `activate-addon` computes `expiresAt` and never uses it (`:129`); seat math differs between the two paths (`1 + extraSeats` vs `maxStaffSeats + 1`).
7. **Social bot AI spend is unmetered** — `lib/ai/social-sales-bot.ts` calls OpenAI directly with zero credit references.
8. **Forged social webhook accepted when `SOCIAL_APP_SECRET` unset** — `webhooks/social/route.ts:535 if (!appSecret) return true;` (opt-in signature checking).
9. **Voucher error mapping is dead code → all voucher failures return HTTP 500** — `if (result instanceof Error)` after a rethrowing transaction is unreachable (`redeem-code/route.ts:149-153`), so `KOD_INVALID/USED/EXPIRED` surface as 500 `code:undefined` while the UI switches on `data.code`.
10. **Expiry checked in a separate statement from the deduction** (no `AND expires_at > now()` in the UPDATE).
11. **No `CHECK(balance>=0)`**, ledger never read → drift between `stores` balances and `store_credits` is undetectable.
12. **Voucher DB CHECK omits `REMOVE_BRANDING`/`STAFF_SEAT`** while `ACTIVATION_CODE_TYPES` includes them (`0012:85-99` vs `billing-packages.ts:147-148`) → admin code generation violates the constraint; `redeem-code` has no `addon` branch → falls into `grantCredits(...,0)` → `INVALID_COST`.
13. **Stale `creditsRemaining` echoed in 402 payloads** (pre-check snapshot, `resend-verification/route.ts:191`).

---

## 3. Checkout & Multi-Tenant Isolation

### 3.1 Server-side checkout flow (`POST /api/checkout`, public)

```
1. Rate gate          withRateLimit → 30 req/min per x-forwarded-for   (:76-77, rate-limit.ts:68-73)
2. Zod validation     checkoutRequestSchema  (validators.ts:3-28)
3. Store resolution   SELECT stores WHERE id = body.storeId            (:105-118)  ← client-supplied by design (guest checkout)
4. Currency gate      body.currency ∈ store.supportedCurrencies        (:120-126)
5. RE-PRICE (server)  SELECT products WHERE store_id = $storeId AND id IN (…)  (:131-174)
                      - merge duplicate lines, reject unknown/foreign/hidden → 400 INVALID_PRODUCT
                      - unitPrice = roundMoney(product.price)  ← DB, client unitPrice NEVER read
                      - totalAmount = Σ unitPrice×qty, roundMoney
6. Loyalty discount   computeCheckoutLoyalty (loyalty-server.ts:64-121), server-authoritative,
                      fails closed (disabledResult → discount 0); redemption clamped by balance AND payable
7. Coupon             ← NEVER APPLIED (no couponCode field exists in the schema or handler)
8. Create order       per payment method:
                        stripe  → order first (PENDING, id pre-generated), session after,
                                  on session failure DELETE order (:285-290 compensation);
                                  metadata carries order_id (:280-283)
                        paddle  → session first, then order; metadata has NO order_id; NO webhook exists
                        cod/manual → order with codVerificationStatus=PENDING_VERIFICATION + riskScore
9. Post-insert        finalizeLoyalty(order.id) + fulfilFromWarehouse()   (:301,377,423)
10. COD notify        sendMeteredWhatsApp(triggerCodVerification)  (:429-450) — failure never breaks checkout
```
> ⚠ No single transaction spans order → items → loyalty → stock (separate `await`s); a failure mid-way leaves an order with no `order_items`. Only the Stripe-session failure is compensated.

**Pricing sources by path:**

| Path | Price source | Tenant filter |
|---|---|---|
| Storefront checkout | ✅ server DB (`checkout/route.ts:137,167`) | ✅ `eq(products.storeId, storeId)` (`:139`) |
| POS | ✅ server DB (`pos/route.ts:112-135`) | ✅ exemplary (`:112-122`) |
| AI social bot | ✅ server DB (`social-sales-bot.ts:591-657`) | ✅ |
| **Merchant `POST /api/orders`** | ❌ **client `unitPrice` summed** (`orders/route.ts:183`) | ❌ **no product→store check** (`:154-264`) |
| Abandoned carts | client-supplied, stored verbatim (`abandoned-carts/route.ts:129-133`) | n/a (never charged) |

### 3.2 Store scoping / tenant isolation

- **No `middleware.ts`** — entrypoint `src/proxy.ts` (Next 16 `proxy`). Subdomain → slug (`:110-140`, reserved-label + slug-format checks), custom domain → slug via DB lookup with 5-min process cache (`:81-108`).
- **The proxy does NOT propagate tenant identity into API requests** (`proxy.ts:226-233` returns `NextResponse.next()` for `/api/*`) → **every API route derives tenancy from payload or session.**

Per-route status (working tree):

| Route | Tenant derivation | Verdict |
|---|---|---|
| `POST /api/checkout` | body `storeId` + product `store_id` filter | ✅ |
| `GET /api/products?slug=` | slug → store | ⚠ returns **entire `stores` row** (`route.ts:34-39`) |
| `POST /api/orders` (merchant) | session store | ❌ foreign `productId` accepted; join leaks foreign product (`:115-118`) |
| `GET /api/orders` | `stores.ownerId = session.id` | ✅ order / ⚠ unfiltered product join |
| `…/orders/track`, `storefront/orders/track` | slug → store + `and(id, storeId)` | ✅ scoped, ⚠ full-order PII, unthrottled |
| `POST /api/orders/verify-cod` | **mandatory** `store_slug`, mismatch → 404 (`verify-cod/route.ts:58-82`) | ✅ |
| `POST /api/orders/cancel` | slug + order `store_id` | ⚠ scoped but **unauthenticated** |
| `POST /api/pos` | session store + catalog `store_id` filter | ✅ |
| `POST /api/coupons` (`/validate`) | `getOwnedStore` / `body.storeId` + `coupons.store_id` | ✅ scoped, ⚠ validate unthrottled |
| Stripe webhook | metadata `store_id` + `FOR UPDATE` on `(id, store_id)` | ✅ |
| WhatsApp webhook | HMAC fails **closed** if secret unset (`whatsapp/route.ts:66-75`) | ✅ |
| Carrier webhook | HMAC **skipped if no secret** (`api/shipping/webhook/route.ts:137-143`) | ❌ |
| `GET /api/storefront/loyalty` | store-scoped | ⚠ public PII (name/points/spend) by phone |

**Isolation leaks:**
1. `GET /api/products?slug=` leaks `ownerId, stripeAccountId, aiCredits, whatsappCredits, planExpiresAt, customDomain, …` unauthenticated; `visible` omitted returns hidden/draft products (`products/route.ts:15,30-32`).
2. **RLS**: `Orders public insert WITH CHECK (true)` and `Order items public insert WITH CHECK (true)` (`supabase/schema.sql:150-151,165-166`); no RLS at all on `coupons, customers, loyalty_*, warehouses*, abandoned_carts, activation_codes, social_channels, store_credits, order_status_logs` → anon-key PostgREST can create orders for any tenant and read vouchers/customer PII. `stores` is `public read USING (true)`.
3. Merchant order path accepts foreign product UUIDs (read/integrity leak).
4. Unauthenticated PII oracles: `/api/orders/track`, `/api/storefront/loyalty`, `/api/coupons/validate`.
5. `successUrl`/`cancelUrl` are arbitrary → post-payment open redirect carrying `session_id` (`validators.ts:23-24`, `stripe.ts:107-108`).

### 3.3 Coupon logic (`src/lib/coupons.ts`, only caller `api/coupons/validate`)

```ts
where(and(eq(coupons.storeId, storeId), eq(coupons.code, trim().toUpperCase())))   // :45-49
timesUsed >= maxUses      → COUPON_EXHAUSTED   (:60)
expiresAt <= now          → COUPON_EXPIRED     (:68)
subtotal < minSpend       → MIN_SPEND_NOT_MET  (:76-84)
discount = max(0, min(discount, subtotal))     // flat amount, capped (:86-89)
```
- Per-store scoping ✅ · expiry ✅ (no start date) · min order ✅ · flat-amount only (no %, no stacking) · no per-customer limit.
- **`timesUsed` is never written anywhere in the repo** → `maxUses` is decorative; no atomic increment exists.
- **Checkout never calls it.** `checkoutRequestSchema` has no `couponCode`; `orders.couponCode` is only ever *read* (`coupons/route.ts:68,76`) → coupons are preview-only, stats permanently 0, "RECOVER10" recovery code cosmetic.
- Related: **flash-sale `promotions` are display-only** — UI puts the discounted price in the cart (`storefront-view.tsx:160-169`) but the server re-prices from base `products.price` → customer is charged full price despite the advertised discount.

### 3.4 Currency & rounding

- Currency is client-chosen but tenant-gated (`checkout:120-126`).
- **No server-side conversion** — `convertAmount` (`currency.ts:194`) is imported by `stripe.ts`/`paddle.ts` but never called; the base-currency amount is simply re-labelled (`stripe.ts:90-102`, `paddle.ts:64-72`). `orders` has **no `currency` column** → selecting `USD` for an EGP-priced catalog charges "49.90" as USD (≈48× overcharge).
- Two divergent rate tables: `BASE_RATES` (`currency.ts:60-77`) vs `EXCHANGE_RATES` (`:80-97`); live rates fetched but never wired in.
- Minor units always `×100`, ignoring `CURRENCY_INFO.decimalDigits` (3-dp KWD, 0-dp JPY) → 10× or 1000× errors.
- `roundMoney` (`loyalty.ts:137-140`): `Math.round(v*100)/100`, **`if (!isFinite) return 0`** → `Infinity` silently becomes total `0.00`.
- Discount rounding residual placed on the last line and divided by quantity (`loyalty.ts:316-318`) → ±0.01 drift vs `orders.totalAmount`.

### 3.5 COD / risk engine

- Order inserted with `codVerificationStatus=PENDING_VERIFICATION`, `riskScore`, `riskReasons` (`checkout:394-410`).
- `assessRisk` (`checkout:214-227`) = store-scoped, phone-normalized history (`risk-engine.ts:92-108`) + rules (`:129-166`): HIGH if address <15 chars, ≥2 cancelled+expired, or total > threshold (default 1500 EGP, env `COD_RISK_AMOUNT_THRESHOLD`). **Score is stored only — it never blocks, holds, or rejects.** Threshold compared against a possibly non-EGP total.
- COD decision path is transactional + `FOR UPDATE` (`cod-verification.ts:291-297`); expiry `PENDING→EXPIRED` after 24h (`COD_VERIFICATION_TTL_HOURS`), triggered from `GET /api/orders` (`orders/route.ts:67`).
- **No fulfillment gate** — nothing in `api/shipping/fulfill`, `shipping-fulfillment.ts`, or `shipping-status-sync.ts` reads `codVerificationStatus` → unverified/expired COD orders ship; the badge is cosmetic.

### 3.6 Checkout flaws (severity-ordered)

1. Coupons entirely unenforced server-side (no discount, no counter, no record).
2. No server-side currency conversion; no `orders.currency`; wrong minor units.
3. Merchant `POST /api/orders` trusts client pricing + foreign productIds.
4. RLS `WITH CHECK (true)` inserts + missing RLS on 10+ `store_id` tables.
5. Unauthenticated cancel + full-PII response + unguarded restock (no `>=0` guard) → inventory drift & PII leak.
6. Public unthrottled oracles (`track`, `loyalty`, `coupons/validate`) and whole-`stores`-row leak in `products?slug=`.
7. **No stock enforcement on storefront checkout** — `products.stock` never read; `deductWarehouseStockForOrder` never throws and silently skips short-stock rows (`warehouses-server.ts:96,119`), returning `EMPTY_RESULT` when no warehouses exist (→ `products.stock` never decremented at all, `:76`) → overselling is free.
8. **Loyalty redemption is read-modify-write, not atomic** — `finalizeCheckoutLoyalty` re-reads `openingBalance`, writes an absolute value with no `FOR UPDATE` / no `WHERE points >= delta` (`loyalty-server.ts:208-230`) → concurrent double-spend of points; and it **swallows all errors** (`:285-288`) while the discount is already baked into `orders.totalAmount` → discount kept, points never deducted.
9. Non-transactional, non-idempotent checkout (retries duplicate orders; only 30/min/IP mitigates).
10. **Unbounded quantity/array** — `quantity` has no max/safe-integer check (`validators.ts:5`); `roundMoney(Infinity)→0` can collapse totals to `0.00`; `numeric(10,2)`/int4 overflow → 500 with an orphan order row already inserted.
11. Promotions display-only (overcharge vs advertised sale price).
12. Risk engine gates nothing; COD verification not enforced before fulfilment; threshold currency mismatch.
13. Low: spoofable in-process rate limits; open redirect; Stripe line item name = product UUID (`checkout:263`); Paddle path dead (no webhook, no `order_id`); mock Stripe success URL when key unset (`stripe.ts:77-85`); comment drift (`checkout:44` references nonexistent `resolvePricedCart`).

**Solid (verified):** storefront re-pricing + tenant filter (`checkout:131-155`, uncommitted hardening); POS as reference implementation; server-authoritative fail-closed loyalty; COD decision tx + mandatory `store_slug`; WhatsApp/Stripe webhooks fail closed (except carrier); admin token comparison constant-time (`admin.ts:37-44`).

---

## 4. Shipping & External Integrations

### 4.1 `/api/shipping` — multi-carrier status summary

Route map (`api/shipping/route.ts`):
- `GET ?summary=1` → sidebar metrics (`:113-168`)
- `GET [?filter=ready|transit|delivered|all]` → queue + counts (`:218-339`)
- `PATCH` → `assignZone|prepareLabels|markLabelsPrinted|markShipped` (`:342-495`)
- Sub-routes: `/integrations`, `/fulfill`, `/awb`, `/awb/[orderId]`, `/webhook`, `/zones`

Summary response (`:123-159`):
```ts
const [unfulfilledRows, totalRows, pendingRows] = await Promise.all([...]);  // 3 counts, parallel
const carriers = await getCarrierHealth(store.id);                          // sequential, NOT parallelized
return { unfulfilledCount, totalShipments, pending, carriers };
```
- `unfulfilledCount`: `orderStatusNotIn(status, ["DELIVERED","CANCELLED"])` (`:42-47`).
- `totalShipments`: `carrierName IS NOT NULL` (`:131-136`).
- `pending`: `carrierName NOT NULL AND shippingStatus IN (UNFULFILLED, LABEL_CREATED, PICKED_UP, OUT_FOR_DELIVERY)` (`:49-55,144`).
- `carriers` = health aggregate over `shipping_integrations WHERE store_id=?` (`:80-86`): `{configured (apiKey non-empty), active (isActive), connected (some active+key)}` (`:64-103`).

**Carrier enumeration:** static catalog `SHIPPING_CARRIERS = ["BOSTA","MYLERZ","ARAMEX","TURBO","CUSTOM"]` (`shipping.ts:33-39`) validated by `isShippingCarrier` (`:55-60`, enforced at `integrations/route.ts:116-121,180-185`). **There is no per-carrier outbound status query and no `GROUP BY carrier`** — status data is push-only via `POST /api/shipping/webhook` → `applyCarrierStatusUpdate` (`shipping-status-sync.ts:74-186`) with `mapCarrierStatus` (`shipping.ts:343-364`). No polling/cron.

Concurrency:
- Summary: `Promise.all` for 3 counts + sequential health. **No `allSettled`.**
- Queue GET: **6 fully sequential queries** (`:259-320`).
- `POST /api/shipping/fulfill`: `Promise.allSettled` in **waves of 5** (`CONCURRENCY=5`, `shipping-fulfillment.ts:35,240-253`), batch cap `MAX_FULFILL_BATCH=100` (`:33`, 400 `TOO_MANY` in `fulfill/route.ts:57-62`), failures folded into `failures[]` (`:255-265`).
- Bulk AWB: sequential `for` loop, `MAX_LABELS=100` (`awb/route.ts:10,60-64`).

Full GET shape (`:322-332`): `{store, orders[≤200], unfulfilledCount, counts:{ready,transit,delivered}, filter}` — list capped at `MAX_BULK_ORDERS*2=200` while `unfulfilledCount` covers the whole table → list/count can disagree.

### 4.2 Missing API keys

**Carriers — silently degrade to a mock shipment** (`shipping-carriers.ts:220-267`):
```ts
if (account.carrier === "CUSTOM" || !account.apiKey) return mockResult(account.carrier);   // :224-226
if (!endpoint) return mockResult(...);                                                       // :229
try { … real POST … }
catch (e) { console.warn(`[shipping] ${carrier} API unavailable, using mock provider:`, e);
            return mockResult(account.carrier); }                                            // :260-266
```
`mockResult` (`:151-159`) fabricates a tracking number, `labelUrl: null`, `source: "mock"`. Encrypted-empty key behaves as missing (`shipping-crypto.ts:44-62`). **Missing key and network failure are indistinguishable in the HTTP response** (both 200, `source:"mock"`; only a `console.warn` differs), yet `bookOrder` still stamps `status="SHIPPED"` (`shipping-fulfillment.ts:145-160`).

**Summary health:** DB failure returns the *same zeros* as "no keys configured", HTTP 200, no `degraded` flag (`shipping/route.ts:94-102`); `degraded:true` only appears when the entire summary throws (`:160-167`, and `carriers` then disappears from the body).

**WhatsApp:** `whatsappApiConfigured()` = `Boolean(WHATSAPP_API_URL && WHATSAPP_API_TOKEN)` (`whatsapp-cloud.ts:10-12`). Unconfigured → `triggerCodVerification` returns `{delivered:false, error:"WhatsApp provider not configured"}` early (`cod-verification.ts:238-240`) → route maps to **HTTP 503 `WHATSAPP_GATEWAY_UNAVAILABLE`** (`resend-verification/route.ts:270-281`) with credits refunded. **Missing key and gateway timeout share the same status/code** — distinguishable only by the free-text `providerError`. (Contrast: the *inbound* WhatsApp webhook returns **501** `WhatsApp webhook is not configured` when `WHATSAPP_APP_SECRET` is unset, `webhooks/whatsapp/route.ts:66-71`.) `sendWhatsAppText` (delivery receipts) just returns `false` when unconfigured (`whatsapp-cloud.ts:39-40`) — silent skip.

### 4.3 External timeouts

**Carrier client `postJson` (`shipping-carriers.ts:161-189`):**
```ts
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);   // default 12000
await fetch(url, { method:"POST", headers, body, signal: controller.signal, cache:"no-store" });
if (!response.ok) throw new Error(`Carrier API ${status}: ${text.slice(0,240)}`);
finally { clearTimeout(timer); }
```
- Timeout → `AbortError` → caught by `createCarrierShipment` → **mock result, HTTP 200** (merchant never told the real carrier timed out).
- **No retry, no backoff, no caching (`no-store`), no 429 handling, no circuit breaker, no queue.**
- Base URL env-overridable per carrier (`:232-233`); defaults `app.bosta.io`, `api.mylerz.com`, `api.aramex.net`, `api.turbo-eg.net` (`:79-143`).
- Partial failure: **one failing order/carrier never fails the batch** (`allSettled` + `failures[]`; `POST /api/shipping/fulfill` always 200 with `{results, failures, fulfilledCount, failedCount, bulkLabelUrl}`, `fulfill/route.ts:75-81`).

**WhatsApp client (`whatsapp-cloud.ts:15-36`):** manual `AbortController` at **10 s**, `cache:"no-store"`, non-2xx → `throw WhatsApp API ${status}: ${body.slice(0,300)}`. No retry, no rate limiting. Timeout is **swallowed inside `triggerCodVerification`** (`cod-verification.ts:251-257`) → converted to `{delivered:false, error}`.

**Summary DB failure → HTTP 200 `{…zeros, degraded:true}`** (`shipping/route.ts:160-167`).

### 4.4 `POST /api/orders/resend-verification`

Auth/tenant sequence (`route.ts:79-135`):
1. `getSession()` → **401** `{error:"Unauthorized"}`.
2. `canManageOrders(role)` → **403** `{code:"FORBIDDEN"}` (`:85-90`).
3. Store by **`stores.ownerId = session.id`** → **404** `STORE_NOT_FOUND` (`:92-102`) ⇒ staff technically pass 2 but always fail 3.
4. Zod `{orderId: uuid, locale?: "en"|"ar"}` → **400** `INVALID_PAYLOAD` (`:104-111`).
5. Order scoped `and(id, storeId)` → **404** `ORDER_NOT_FOUND` (`:116-127`).
6. `isCodOrder` (paymentMethod ∈ `cod|manual`) else **400** `NOT_COD` (`:130-135`).

Credit pre-check (`:137-158`): `waCredits < 1 || expiresAt <= now` → **402** `{code: WHATSAPP_CREDITS_EXHAUSTED | CREDITS_EXPIRED, error: <Arabic billing msg>, creditsRemaining}` (TOCTOU — harmless only because the real deduction is atomic).

**Verification artifact — no numeric OTP.** It is a signed short URL + interactive buttons:
- Reply ids `COD_CONFIRM_<orderId>` / `COD_CANCEL_<orderId>` (`cod-verification.ts:61-65`, `cod-shared.ts:23-24`).
- Link `https://{slug}.{rootDomain}/order/{id}/verify` (`cod-shared.ts:31-46`).
- Stored in `cod_verification_status`, `verified_at`, `verification_sent_at` (`schema.ts:259-266`); resend re-opens `PENDING_VERIFICATION` unless already `VERIFIED` (`:160-168`).
- `verificationSentAt` is stamped **before** the config/send attempt (`cod-verification.ts:232-236`) → a failed send still restarts the 24 h TTL.
- Expiry: `expireStaleCodVerifications(storeId)` flips `PENDING→EXPIRED` where `coalesce(verification_sent_at, created_at) < now() - TTL` (`:407-422`, TTL default 24 h from `risk-engine.ts:24,60-63`) — invoked from `GET /api/orders`, **not** from resend.

Dispatch & credits (`:170-220`):
```ts
outcome = await sendMeteredWhatsApp(storeId, "COD verification resend",
  () => triggerCodVerification(orderId, { locale, origin: request.nextUrl.origin }));
```
Deduct-before-send in one transaction, refund on throw/non-delivery (see §2.3).

**Response matrix:**

| Condition | Status | Code / body |
|---|---|---|
| No session | 401 | `{error}` |
| Role | 403 | `FORBIDDEN` |
| No store | 404 | `STORE_NOT_FOUND` |
| Bad payload | 400 | `INVALID_PAYLOAD` |
| Other tenant's order | 404 | `ORDER_NOT_FOUND` |
| Not COD | 400 | `NOT_COD` |
| No/expired credits | **402** | `WHATSAPP_CREDITS_EXHAUSTED` / `CREDITS_EXPIRED` + `creditsRemaining` (stale) |
| `PaywallError` mid-flight | **402** | paywall code + stale `creditsRemaining` |
| Gateway timeout / send throw (dedicated branch `:199-217`) | **503** | `WHATSAPP_GATEWAY_UNAVAILABLE` — **largely dead code** (`triggerCodVerification` swallows) |
| Provider not configured / rejected / timeout via `!delivered` (`:270-281`) | **503** | `WHATSAPP_GATEWAY_UNAVAILABLE` + `providerError` (raw ≤300 chars) |
| Order vanished during send | 404 | `ORDER_NOT_FOUND` (`:231-246`) |
| Missing customer phone | 400 | `MISSING_CUSTOMER_PHONE` (`:248-263`) |
| Success | **200** | `{success:true, alreadyVerified, creditsRemaining, delivered:true, channel:"whatsapp_api"\|"fallback_link", verifyUrl}` (`:284-295`) |
| Unexpected | 500 | `createErrorResponse`, **409 explicitly remapped to 500** (`:305-315`) |

No secret/token is ever returned — only `verifyUrl` and `providerError`.

### 4.5 Shipping/integration flaws

**Critical/High**
1. **Carrier webhook unauthenticated when no secret configured** — `if (secret) { verify… }` (`api/shipping/webhook/route.ts:137-143`) → anyone can POST `{tracking_number, status:"DELIVERED"}` → order set `DELIVERED` + `paymentStatus="paid"` → **cross-tenant revenue/fulfilment forgery**. No IP allowlist, no replay protection.
2. **Webhook order lookup not tenant-scoped; `trackingNumber` non-unique** (`shipping-status-sync.ts:78-83`, only `orders_tracking_number_idx`, `schema.ts:288`; mock numbers = `prefix+yymmdd+6 random base36` in ~2.1B space, `shipping.ts:430-435`) → collision/foreign mutation.
3. **Missing keys/outages mint fake tracking numbers and mark orders SHIPPED** — indistinguishable from real bookings; orders become untrackable at the real carrier while the dashboard shows a carrier name.
4. **Plaintext carrier API key placed in the outbound request body** — `credentials: { key: account.apiKey, secret: "•••" }` (`shipping-carriers.ts:211`) to an env-overridable base URL; error bodies (≤240 chars) are logged.
5. **No rate limiting on `POST /api/orders/resend-verification`** — checkout/auth/AI/`verify-cod` have limiters, this one does not → a session holder can burn all WhatsApp credits and spam a customer at platform speed.

**Medium**
6. Rate limiters key on spoofable `x-forwarded-for` first hop and are per-process `Map` (`rate-limit.ts:15,32-35`) → bypassable and ineffective across instances.
7. **Non-idempotent resend** — no idempotency key/cooldown/dedupe (2 rapid POSTs = 2 credits, 2 messages); sends even when already `VERIFIED`; re-opens `EXPIRED → PENDING_VERIFICATION`, undoing the fraud-shield expiry.
8. **TTL restarts even on failed/unconfigured sends** (`cod-verification.ts:232-240`).
9. Gateway-timeout detection branch is dead code (`resend/route.ts:199-217`); real timeouts surface as raw `providerError` text (info-disclosure nit) via a second 503 producer.
10. Missing-WhatsApp-config reported identically to a gateway outage (no `WHATSAPP_NOT_CONFIGURED`/501 equivalent, unlike the inbound webhook).
11. Stale `creditsRemaining` echoed in 402s; pre-check is a TOCTOU.
12. Carrier-health DB errors reported as "0 configured" with HTTP 200 and no `degraded` flag.

**Lower / correctness**
13. Bulk fulfillment latency: 100 orders × (per-order count query N+1, `shipping-fulfillment.ts:132`) + 12 s carrier POSTs in waves of 5 ⇒ worst case ≳ 240 s → serverless timeout risk; no request-level deadline, no circuit breaker.
14. Duplicate concurrent fulfill can double-book at the carrier — no `FOR UPDATE` and no unique constraint on `tracking_number` (`:110-118`).
15. Non-summary `GET /api/shipping` is 6 sequential round-trips; row cap 200 vs unbounded count.
16. No caching / 429 handling for carrier APIs — carrier 429 silently becomes a mock label.
17. Good: AES-256-GCM secret envelope (`shipping-crypto.ts:27-42`), responses expose only `hasApiKey`/`apiKeyMasked=••••<last4>` (`integrations/route.ts:36-52`); residual nit = hard-coded fallback crypto key (`shipping-crypto.ts:16-25`, unreachable because `auth.ts:9-11` throws without `JWT_SECRET`).
18. Tracking lookups return the **full order row** (PII incl. `customerPhone`, `customerAddress`, `notes`) given only slug + order UUID (and phone-based lookup on the storefront variant), no auth, no rate limit.

---

## Appendix — Cross-cutting quick reference

### Every writer of `orders.status`

| Writer | Validates transition? | Restocks? | Audit log |
|---|---|---|---|
| Checkout/order create | n/a (insert `PENDING`) | n/a | no |
| POS create | no (insert `DELIVERED`) | n/a (decrements) | no |
| Staff/owner `PATCH /api/orders` | yes (OWNER bypass) | **no** | in-tx |
| Owner `PATCH /api/orders/[id]` | yes (OWNER + `CANCELLED→DELIVERED`) | **no** | in-tx |
| Customer `POST /api/orders/cancel` | yes | **yes** | in-tx |
| COD decision | confirm: no / cancel: yes | **yes on cancel** | post-commit best-effort |
| Stripe webhook | tautological | no | in-tx (2 rows) |
| Carrier webhook | **no** (rank guard only) | no | post-commit best-effort |
| Bulk `markShipped` | **no** | no | **none** |
| `bookOrder` auto-fulfil | **no** | no | post-commit best-effort |

### Top architectural risks (consolidated)

1. **Carrier webhook forgery → forged revenue** (unauthenticated when secret unset + non-unique tracking number + forces `paymentStatus="paid"`).
2. **Credit leakage**: voucher claim/grant split transactions; AI deduct-without-refund + billed mock output; crash-window WA credit loss; fail-open metering on missing schema.
3. **Zero coupon enforcement** + no `timesUsed` writes; promotions display-only (customer charged above advertised price).
4. **No server-side currency conversion** (`orders` has no `currency`) → up to ~48× mischarging.
5. **Inventory drift**: restock only on 2 of 4 cancel paths; `warehouse_stock` never restored; unguarded restock; no stock check on storefront checkout.
6. **RLS `WITH CHECK (true)` order inserts** + 10+ tables without RLS → anon-key cross-tenant writes/reads.
7. **Loyalty points**: read-modify-write double-spend, errors swallowed while discount persists, never clawed back on cancel.
8. **Checkout not transactional/idempotent**; unbounded quantities → overflow/zero-total edge cases.
9. **State machine bypasses** in shipping paths (no audit, no guards) and inconsistent OWNER override semantics between two PATCH routes.
10. **Unauthenticated endpoints returning PII**: `/api/orders/cancel`, `/api/orders/track`, `/api/storefront/loyalty`.
