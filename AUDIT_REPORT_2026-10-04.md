# FULL CODEBASE AUDIT — SYSTEM IMPROVEMENT REPORT

**Audit Date:** 2026-10-04
**Stack:** Next.js 16.2.6 / React 19.2.6 / Drizzle 0.45.2 / Postgres+Supabase
**Static analysis:** `tsc --noEmit` → 0 errors, `eslint .` → 0 errors (both pass; all findings below are runtime/logic/security issues invisible to the type system)
**Scope:** 66 API routes, 18 dashboard pages, DB schema + 18 SQL migrations, RLS, realtime, i18n (1327 keys), credit/billing system.
**Overall health:** **C+** — architecture is sound and tenant scoping is consistent at the app layer, but there are 8 ship-blockers: a dead payment webhook, client-authoritative prices, header-spoofable admin auth, unauthenticated order control, fail-open webhooks, missing RLS on 18 tenant tables, a non-transactional credit grant, and a status-vocabulary split that silently breaks cancel/Stripe/stats/realtime.

> Note: the prior `AUDIT_REPORT.md` (2026-10-02, "B+") rates `admin localhost lock` and `atomic voucher claim` as strengths — both were re-verified today and are defective (see C3, C6).

---

## 🚨 CRITICAL BUGS & ERROR POINTS (fix immediately)

### C1. Stripe webhook has no handler — payments never confirmed
`src/app/api/webhooks/stripe/route.ts` (206 lines) defines only helpers (`handleCheckoutSessionCompleted`, `updateOrderPaymentStatus`…) and **exports no `POST`**. `verifyWebhookSignature` (line 6) is imported but never called. The endpoint returns 405 forever → orders never flip `PENDING→CONFIRMED`, `paymentStatus` never updates, Connect `account.updated` sync never runs.
**Fix:** export `POST(request)`, verify with `await request.text()` + `stripe-signature` + `STRIPE_WEBHOOK_SECRET`, dispatch handlers in try/catch, return 200 only after processing.

### C2. Checkout trusts client-supplied prices and product IDs
`src/app/api/checkout/route.ts:127` — `totalAmount += item.unitPrice * item.quantity` from the request body; persisted at `:237/:313/:359` and charged via Stripe (`src/lib/payments/stripe.ts:94`). `items[].productId` is never checked to belong to `storeId` (insert at `:236-243`) → any buyer pays any price (or 0) and any tenant's product UUID can be attached to an order. Same flaw in authenticated `POST /api/orders` (`:172-175, 216-223`); `POS` does it right (`pos/route.ts:126` recomputes server-side).
**Fix:** `SELECT * FROM products WHERE store_id=$1 AND id = ANY($ids)`, reject unknown/foreign IDs with 400 `INVALID_PRODUCT`, recompute `unitPrice` from `products.price`, drop `unitPrice` from the public contract.

### C3. Admin APIs authorized by spoofable headers
`src/lib/admin.ts:8-44` — "admin" = `Host.startsWith("localhost")` or first `x-forwarded-for` entry in private ranges (plus `NODE_ENV==="development"` short-circuit). Gates `api/admin/codes` (generate/list all paid voucher codes) and `api/admin/pricing` (mutate global pricing). Any deployment where the app is reachable directly, or any request where the proxy doesn't strip `Host`/`X-Forwarded-For`, grants **unauthenticated admin access**.
**Fix:** require `ADMIN_TOKEN` compared via `timingSafeEqual`, or an authenticated session with a real role claim. Never derive identity from `Host`/`X-Forwarded-For`.

### C4. Order confirm/cancel is unauthenticated
- `src/app/api/orders/verify-cod/route.ts:19,52-78` — `store_slug` is `.optional()`; the tenant check **only runs if the caller sends it**. Omit it and post `{order_id, status:"CONFIRMED"}` to confirm/cancel **any order in any tenant** (only 20 req/min rate limit). `:97` then returns full order PII (name/phone/address).
- `src/app/api/orders/cancel/route.ts:9-19` — no `getSession()` at all; knowing `orderId` + public `storeSlug` suffices (order IDs leak in checkout success URLs, `checkout/route.ts:382`).
**Fix:** make tenant proof mandatory (signed single-use token in the verification link, HMAC'd); return a minimal DTO, never the full row.

### C5. Webhooks fail open (signature verification opt-in)
- `src/app/api/webhooks/social/route.ts:494-495` — `if (!appSecret) return true;` and `.env.example` ships `SOCIAL_APP_SECRET=` empty → forged comment/DM events drive the AI sales bot, send DMs **using the victim store's stored WhatsApp/Messenger tokens** (`resolveChannel` store-by-id path `:270-302`), spend AI credits, and create real orders — with **zero credit checks**.
- `src/app/api/shipping/webhook/route.ts:137-143` — if no secret configured, request processed unverified → anyone can POST `{tracking_number,status:"DELIVERED"}` and flip orders to Completed+Paid (triggering customer WhatsApp messages).
**Fix:** fail closed — 401/501 when the secret is unset (as `webhooks/whatsapp/route.ts:66-75` already does correctly); delete the simulation payload path outside dev.

### C6. Credit grant runs outside its own transaction (free credits)
`src/app/api/billing/redeem-code/route.ts:74` opens `db.transaction(tx)`, claims the code atomically at `:97-111` (good), but calls `grantCredits()` at `:130` → `src/lib/paywall.ts:542` uses the **module-level `db`** (a different pooled connection). If the tx rolls back/crashes after the grant, credits are persisted against an unused code → reusable code = free credits. Same in `billing/activate-addon/route.ts:83→131` (`upsertAddOn` on global `db`).
**Fix:** `grantCredits(tx, …)`, `upsertAddOn(tx, …)`, `recordCreditUsage(tx, …)` — thread the transaction handle through.

### C7. RLS missing on 18 of 25 tenant tables + `WITH CHECK (true)` insert policies
- Only `users, stores, categories, products, orders, order_items` have `ENABLE ROW LEVEL SECURITY` (`supabase/schema.sql:88-93`). **No RLS on:** `activation_codes`, `store_credits`, `customers`, `loyalty_*`, `coupons`, `promotions`, `abandoned_carts`, `warehouses/warehouse_stock/stock_transfers`, `shipping_integrations`, `social_channels`, `ai_chat_sessions`, `order_status_logs`, `store_add_ons`, `activation_code_pricing` → with just the public anon key these are fully readable/writable via PostgREST: **every unredeemed voucher code**, carrier `api_key/api_secret`, social `access_token`, all tenants' customer PII, `abandoned_carts.recovery_token`.
- `supabase/schema.sql:150-151,165-166` — `Orders/Order items public insert WITH CHECK (true)` → anon can insert orders for **any tenant** (analytics poisoning, COD spam, inventory impact).
- `schema.sql:100-101` — `Stores public read USING (true)` leaks `owner_id`, `stripe_account_id`, `paddle_vendor_id`, credit balances to anon.
**Fix:** one migration enabling RLS on every `public` table with `store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())` policies; drop the anonymous insert policies (checkout only via your API); column-level grants for storefront reads.

### C8. Order status vocabulary split — one bug, eight symptoms
Writers emit `"Pending"` (`checkout/route.ts:226,302,345`, `orders/route.ts:201`, schema default `schema.ts:249`), `"CANCELLED"` (`orders/cancel/route.ts:76`), `"Cancelled"` (`cod-verification.ts:367`), `"Shipped"` (`shipping/route.ts:347`), `"Completed"` (`pos/route.ts:171`); consumers expect UPPERCASE (`lib/types.ts:1-9`, `order-state-machine.ts:16-24`). Verified consequences:
- `dashboard/stats/route.ts:76` counts `status='PENDING'` → **pending metric always 0** (confirmed by read).
- `orders/cancel/route.ts:55` — `VALID_TRANSITIONS["Pending"]` is undefined → **customers cannot cancel checkout orders** (400); same for COD cancel (`cod-verification.ts:347`) and `orders/[id]` confirm (`:103`).
- `webhooks/stripe/route.ts:143` `previousStatus === "PENDING"` → Stripe orders never advance.
- `realtime.ts:117` pending notification never fires; `analytics/route.ts:95` `!= 'Cancelled'` still counts `'CANCELLED'` rows; `order-metrics.ts:18` `REVENUE='DELIVERED'` → POS `"Completed"` sales count as 0 revenue.
- UI: status badges/filters render blank (`i18n.tsx:99-105` has only `status.Pending…`; code passes uppercase), `select value={order.status}` matches no `<option>`.
**Fix:** one canonical enum + `CHECK (status IN (…))`, backfill `UPDATE orders SET status=upper(status)`, fix all writers, then `t(\`status.${status.toLowerCase()}\`)`.

---

## ⚠️ LOGICAL & INTEGRATION FLAWS (billing, API responses, status codes)

### Billing / credits
1. **4 WhatsApp send paths bypass the paywall entirely** — `checkout/route.ts:370`, `orders/route.ts:235`, `lib/shipping-status-sync.ts:199`, `webhooks/social/route.ts:422,430,469` send with no `canUseWhatsAppCredits`/`deductCredits`. Metering exists only in `ai/description:54`, `ai/insights:87`, `ai/marketing:77`, `orders/resend-verification:130`. → Introduce one `sendMeteredWhatsApp()` (deduct → send → ledger) and route all call sites through it.
2. **`resend-verification` deducts after sending** (`route.ts:123` send → `:130` deduct): concurrent requests all pass the stale pre-check (`:43,89`) → N sends for 1 credit; a failed send still costs a credit; `PaywallError` swallowed at `:131-138`; `:150-162` returns `success:true` even when `delivered:false` (raw provider error leaked at `:159`).
3. **Deduct and ledger are not atomic** — `paywall.ts:307-311` (deduction, correctly atomic ✅) vs `:588` `recordCreditUsage` called afterwards by each route; failure between → balance↓ with no audit row; `balance_after` computed from a stale snapshot → out-of-order under concurrency; no idempotency key on `store_credits` (`schema.ts:693`); the ledger is never read anywhere (write-only, drift invisible). `grantCredits` (`paywall.ts:542-565`) also swallows its ledger-insert error.
4. **No refunds** — AI credits deducted *before* the model call (`ai/description:54→65` etc.) and `lib/ai.ts` never throws (falls back to mock) → credits consumed for mock/failed generations; zero `refund`/`rollback` code in the repo.
5. **Entire plan/add-on paywall is dead code** — `resolveApiFeatureGate:683`, `isGatedApiPath:674`, `requireActivePlan:417`, `hasFeatureAccess:440`, `hasCredits:389` have **zero call sites outside `paywall.ts`** (verified). `middleware.ts:142-164` only checks store existence → expired/free plans and add-on entitlements are enforced **nowhere** server-side; the gate's `/api/whatsapp/*` prefix matches no existing route.
6. **"30-day" add-ons never expire** — `activate-addon/route.ts:129` computes `expiresAt` and discards it; `store_add_ons` has no expiry column (`schema.ts:693` area); `hasFeatureAccess` never checks one → `validityDays` returned to the client is a lie. Meanwhile `billing/addons:99-102` sets `maxStaffSeats` absolutely while `activate-addon:134-139` increments → seat counts reset.
7. **Add-on voucher types rejected by the DB** — `supabase/migrations/0012:88-99` CHECK omits `REMOVE_BRANDING`/`STAFF_SEAT` → admin code creation 500s; `redeem-code` has no `addon` branch → falls into `grantCredits(…,0)` → `PaywallError`.
8. **Voucher errors always return 500** — `redeem-code/route.ts:83-116` throws `Error("KOD_*")`; drizzle rethrows after rollback so the `result instanceof Error` mapping at `:149-153` is **dead code** → outer catch returns 500 with `code: undefined`; clients (`PaymentModal.tsx:90-102`) switch on `code` → users always see the generic error. Same in `activate-addon:152-162` and `orders/cancel:102-115` (404/400 mapping dead → 500s). Missing/used/expired codes should be 400/409/410.
9. **Middleware paywall + fail-open metering** — `deductCredits` returns `null` on schema-missing and routes proceed unmetered; degraded entitlements set `planActive=true`. Billing paths must fail closed (402/503).
10. **Loyalty points are read-modify-write** — `loyalty-server.ts:208-230` reads `openingBalance`, computes in JS, writes absolutely (no `WHERE loyalty_points >= delta`, no row lock, no tx); the ledger insert is a third statement whose errors are swallowed (`:285-288`) → double-redeem under concurrency and discounts baked into `orders.total_amount` with points never deducted. Same in `loyalty/route.ts:566-598`. → atomic relative `UPDATE … WHERE loyalty_points >= $1 RETURNING` + ledger in one tx.

### API responses / status codes
11. **Loyalty returns HTTP 200 for server errors** — `loyalty/route.ts:274-295,505-518` deliberately never surfaces 500; PATCH reports `success:false` with 200.
12. **Admin pricing fabricates success** — `admin/pricing/route.ts:246-267` returns 200 with a success payload for a write that never ran whenever `error.message` merely contains `activation_code_pricing`/`42P01`.
13. **401 vs 404 conflation** — `social/channels/route.ts:74-79,167-173,205-211,258-264`, `social/sessions/route.ts:50-56,114-120` return 404 for unauthenticated requests (`getStoreId()` conflates "no session" with "no store").
14. **Invalid UUIDs → 500 everywhere** — only `stores/[id]` validates; `products:215-223`, `coupons:195-206`, `promotions:308-319`, `orders/track:47-51`, `loyalty:420-426`, etc. hit Postgres `22P02` → generic 500. → `z.string().uuid()` + map `22P02` to 400 in `createErrorResponse`.
15. **Missing Zod on major routes** — `products` POST/PATCH (price = `String(price)` accepts `"abc"`/negatives; `categoryId` never checked for store ownership → cross-tenant link), `categories`, `coupons` (despite `couponValidateSchema` existing), `promotions` (empty titles, unbounded `bannerText`, unowned `targetProductIds`), `auth/login` (non-string email → 500 instead of 400), `billing/route.ts:43-44`, all `/api/ai/*` (manual checks), `billing/addons`.
16. **Coupons never enforced server-side** — `timesUsed` is never incremented anywhere; checkout accepts no `couponCode` → `maxUses` is decorative, discount is purely client-side, coupon revenue stats always 0.
17. **Session JWTs omit `role` after signup/onboarding/store-create** (`onboarding/route.ts:154-161`, `stores/route.ts:93-100`, `signup`) → the rightful owner gets **403 from every `canManageOrders()` check** until they log out and back in (only `login` sets `role:"OWNER"`, `auth.ts:121`). Also `role` is never re-read from DB → demotions don't apply for 7 days; the STAFF model is effectively non-functional.
18. **`PATCH /api/stores` allows payment-field writes** — `lib/store-update.ts:17-29,93-105` lets any owner set `stripeEnabled:true` + arbitrary `stripeAccountId`/`paddleVendorId`, bypassing Connect onboarding and redirecting transfers to an attacker-chosen account.
19. **Public product API leaks the whole stores row** — `products/route.ts:39` returns `ownerId`, `stripeAccountId`, `paddleVendorId`, `whatsappCredits`, `aiCredits`, `manualPaymentInstructions`, `planExpiresAt` to unauthenticated callers.
20. **PII oracles, no rate limit** — `orders/track/route.ts:8-99`: `?slug=&phone=` (unauthenticated, unthrottled, phone not UUID-validated) returns full customer PII; enumeration of any store's customers. Missing rate limits also on `orders/cancel`, `coupons/validate`, `stores/check-slug`.
21. **Rate limiter is bypassable** — `rate-limit.ts:32-35` keys on client-controlled `x-forwarded-for`, in-memory per process (useless across serverless instances); `ai/description` has no limiter at all.
22. **Checkout is not transactional / not idempotent** — `checkout/route.ts:216-243` (and paddle `:292-319`, cod `:335-365`): order insert → items → loyalty finalize → stock deduct are separate awaits; failure after the order insert leaves an order with no items; retries create duplicates; Stripe session created *before* the order (`:200`). Orphan stock/loyalty writes possible (`fulfilFromWarehouse` never throws).
23. **Inventory asymmetry** — checkout deducts `warehouse_stock` + `products.stock`; cancel restocks **only** `products.stock` (`orders/cancel/route.ts:69-73`), POS deducts only `products.stock` (`pos/route.ts:191-210`) → the two drift permanently; restock has no `>= 0` guard.
24. **Repeat cancel double-restocks** — `order-state-machine.ts:48-49` returns true when `from === to`, so cancelling an already-CANCELLED order restocks again (`orders/cancel:59-72`).
25. **Loyalty points race in checkout** — see #10; plus `orders` POST ignores `orderId` field: `const orderIdToUse = id || ""` (`orders/route.ts:293`) → empty string cast to uuid → 500; state-machine validation commented out (`:313-315`); `status` typed bare `z.string()` (`validators.ts:43-49`).
26. **Error detail leakage** — raw Postgres `code` to clients (`errors.ts:124-127`), signup returns infra diagnostics ("Run supabase/schema.sql…"), WhatsApp Graph body (300 chars) surfaced in responses (`whatsapp-cloud.ts:31` → `resend-verification:159`, social webhook).
27. **Open redirect in checkout** — `validators.ts:19-20` accepts any absolute `successUrl`/`cancelUrl` → post-payment redirect to attacker page carrying `session_id`.

### Database / migrations
28. **Dual, divergent migration systems** — `drizzle/` has 1 migration covering 7 of 25 tables (and an `activation_codes` shape already dropped by `supabase/migrations/0012`); no `db:generate/migrate` scripts in `package.json`; `scripts/apply-migration.js:160-165` runs each statement **autocommit** (no BEGIN/COMMIT), has **no migration-ledger table** (re-runs replay all 18 files), and `supabase/config.toml` doesn't exist so the documented `supabase db push` cannot work. No down-migrations; destructive `DROP COLUMN` in `0012`.
29. **Analytics queries are broken** — `analytics/route.ts:125,159`: `` sql`(CURRENT_DATE - INTERVAL '${N} days')` `` compiles to `INTERVAL '$1 days'` — Postgres does not bind parameters inside string literals → query error/invalid interval (verified by compiling with installed drizzle). Fix: `INTERVAL '1 day' * ${N}`.
30. **Realtime: `products` not in the publication** — `supabase/realtime.sql:14-25` adds only `orders`; `StorefrontClientShell.tsx:91-99` subscribes to `products` → never receives events, sticks at `error` with no retry/polling fallback. `broadcastOrderUpdate` (`realtime.ts:313-320`) leaks a socket per call, needs `SUPABASE_SERVICE_ROLE_KEY` (**absent from `.env.example`/`.env.local`** → always warn-and-return, so realtime broadcasts never happen), and is invoked *inside* `db.transaction` (`webhooks/stripe:188-194`, `shipping-status-sync:157`) holding locks across network I/O. JWT expires at 1 h with no re-auth; `REPLICA IDENTITY` default → `payload.old` is PK-only.
31. **Schema hardening** — no `CHECK (>= 0)` on money/stock/credits (`products.price/stock`, `orders.total_amount`, `stores.ai_credits/whatsapp_credits`, `customers.loyalty_points`); no `CHECK` on `orders.status`; `UNIQUE(store_id, phone)` + `phone DEFAULT ''` → latent `23505` (`0009:38,44`); `order_items.product_id ON DELETE CASCADE` (`schema.ts:298`) **erases order history** when a product is deleted; cross-tenant FKs allowed (`products.category_id`, `orders.shipping_zone_id`, `customers.current_vip_tier_id` — no store-consistency guard); `warehouses` cascade deletes `stock_transfers` audit rows.
32. **Connection pool unbounded for serverless** — `db/index.ts:281-289`: no `max`, no `statement_timeout`/`idle_in_transaction_session_timeout`; `pg` default 10/proc × instances → Supabase connection exhaustion. (Positive: no `client.release()` leaks found — everything goes through `db.transaction`.)

---

## 🎨 UI / UX IMPROVEMENTS

### Broken features (fix first)
1. **Settings Save button does nothing** — `dashboard/settings/page.tsx:307-315`: `type="button"` with **no `onClick`**, `saving` never set, `toast` state (line 75) dead. Store profile edits can never be saved.
2. **Stripe settings UI is decorative** — `settings/payment-settings.tsx`: `stripeConnected` never set (`:32`, fetch `:56-80` never reads it) → always "Not connected"; API key fields (`:318-354`) neither loaded nor included in `handleSave` (`:133-139`) → keys silently discarded; manual-pay toggle no-op (`:66` `manualPaymentInstructions ? true : true`, never persisted).
3. **Currency settings are cosmetic** — `i18n.tsx:3230` `formatMoney` hardcodes `EGP`; dict literals `"Today's Sales (EGP)"` (`:72`), `"Price (EGP) *"` (`:118`), `"299 EGP / month"` (`:217,221`), `ai-radar:377`.
4. **WhatsApp offers send a placeholder domain** — `ai-radar/page.tsx:347` sends `https://your-store.com/cart/...` to **real customers**; message text hardcoded Arabic (`:346`).
5. **"AI Generate" is fake and can deadlock** — `ai-radar:222-264`: `setTimeout(500)` + hardcoded templates presented as generation; `if (!product) return` runs *after* `setCopyLoading(true)` → button stuck disabled forever.

### Loading / error / state management
6. **Systemic: failed loads render empty state as truth** — no `res.ok` checks, errors swallowed (`.catch(() => {})`), no error UI anywhere: `orders/page.tsx` shows "No orders yet" on network failure; same in `products`, `analytics`, `abandoned-carts`, `customers`, `marketing`, `categories:15-24`, `settings/page:86-113` (blank form), `ai-radar:63-177`, `dashboard/page:41-66` (blank metric grid when `stats===null`). Worse: `shipping-labels/page.tsx:133-147` sets `loadedFilter` on failure → **previous filter's rows shown under the new filter's header**.
   → shared `fetchJson` wrapper with `error` state + toast + retry + `AbortController`; add nested `error.tsx` (only root + `dashboard/loading.tsx` exist).
7. **Loyalty 30 s polling clobbers in-progress edits** — `settings/loyalty/page.tsx:71`: `setInterval(load,30000)` unconditionally resets form state; `saveSettings/saveTier` don't check `res.ok`; `submitAdjustment:154` treats error bodies as success (`data.success !== false`).
8. **No request cancellation anywhere** — zero `AbortController` in the repo; effects missing `cancelled` flags → setState-after-unmount (`ai-radar:67,120`, `categories:40`, `settings/page:86`, `theme-settings:22`).
9. **Duplicate / racy network calls** — `ai-radar:190-191` two hooks each fetch `/api/orders` on mount regardless of tab; `onboarding:58-65` `checkSlugAvailability` fires **per keystroke** (no debounce) and on error `data.available===undefined` → submit wrongly blocked with "slug taken"; `Sidebar.tsx:113-211` fires **5 summary fetches on every pathname change** (all `catch(()=>{})`, copy-pasted) — biggest duplication block in the app.
10. **Missing pending/double-submit protection** — `products` `toggleVisibility`/`handleDelete`, `promotions:togglePromotion`, `categories:79` `handleDelete` have no per-row busy state → duplicate requests. (`shipping`, `shipping-labels` show the correct `busy`+rollback pattern — use as reference.)
11. **Destructive-action gaps** — `shipping-labels:196` `handleFulfillAndPrint` with no selection falls back to **all rows** without confirmation; native `confirm()` dialogs (`categories:80`, `domain:151`, `shipping-labels:247,292`).
12. **`dashboard/page.tsx:93`** `pendingCount || stats.pendingOrders` treats a legitimate `0` as unset.

### i18n / localization
13. **Missing dynamic keys (casing)** — dict has only `status.Pending…Cancelled` (`i18n.tsx:99-105`) and `orders.status.pending…` (`603-609`); code passes UPPERCASE (`orders/page.tsx:313`, `StatusBadge.tsx:20`, `OrderInvoiceModal.tsx:64`) → **blank status filter buttons and blank badges** (only escaped by `as never` casts at `onboarding:240`, `orders:313`, `domain-settings:244`, `shipping-labels:540`). Literal-key audit: 1327/1327 en↔ar parity, 0 literal misses — the problem is entirely dynamic-key typing. → typed helper `tk(prefix, value)` built on an exhaustive `Record` so misses become compile errors.
14. **Hardcoded Arabic (English locale shows Arabic)** — `orders/page.tsx:142,149` (toasts), **`:184-190` all 7 status-select options**, `:234` resend button, `:247,253,259,265` COD badges; `ai-radar:346`; `abandoned-carts:363` `join("، ")`; `social-bot:848,861`.
15. **Hardcoded English (Arabic locale shows English)** — `ai-radar:47-51` risk badges, `:293,388` Loading…, `:354` Send WhatsApp Offer, `:434-439` action labels; `theme-settings:168-174,345-346,31,82`; `payment-settings:104,144,163`; `billing:1078`; `loyalty` table headers/placeholders; `i18n.tsx:165` **and** `:1730` `pos.pay.cash = "Cash / كاش"` in **both** dicts; `src/lib/currency.ts:42-48` currency names English-only.
16. **RTL breakage** (direction plumbing itself is good — SSR `lang/dir`, no-flash script, logical utilities, `dir="ltr"` islands) — physical classes: `onboarding:210` `pl-28` → **prefix overlap under `storehub.io/`** (→ `ps-28`), `billing:549,561,566,791,882` `mr-/ml-`, `domain-settings:313` `text-left` → `text-start`, `CurrencySelector:105,116` `right-0`/`text-left`, `theme-settings:136,202,230,258` `border-l`/`right-0`/`rounded-r-lg`, `ActivationAddonModal:161` `ml-1`. **Toggle knobs don't mirror** — `translate-x-5` is physical so switches slide the wrong way in RTL: `payment-settings:224,398,489,550`, `shipping-labels:751`, `billing:994`, `promotions:1030`, `shipping:766`, `social-bot:526`.
17. **Accessibility** — hamburger labeled `common.close` (`layout.tsx:322`); toasts lack `role="status"`/`aria-live` (order-alert toast `layout.tsx:355`); no `htmlFor/id` in settings/theme/currency/domain forms (contrast `shipping-labels:621-687`, done right); theme radios `className="hidden"` → keyboard-inaccessible (`theme-settings:166`); `role="switch"` without names (`payment-settings:213,387,478,539`); ai-radar platform tiles are `div onClick` with no `role`/keyboard; categories modal no `role="dialog"`/focus trap/Escape; duplicate `aria-label` on the 3 color pickers (`theme-settings:199,227,255`); `handleLogout` has no error handling (`layout.tsx:207`).
18. **Duplication to extract** — toast state+timer copied in ≥8 pages; duplicated fetch callbacks (`domain-settings:58-71` vs `:73-90`, `warehouses`); category value sets diverge (onboarding lowercase `retail/electronics` vs settings `Fashion/Electronics` → no matching option).

---

## 💡 BEST PRACTICES & PERFORMANCE RECOMMENDATIONS

1. **Unbounded queries** — `orders/route.ts:127-131` (+ a full pending-ID scan on every GET `:68-71`), `products:34-37`, `categories:26-31`, `customers:36-55`, `abandoned-carts:61-65`, `loyalty:179-204` — no pagination, `SELECT *`, no projections. Add cursor/limit (default 50, cap 200), explicit `.select({…})`, composite index `(store_id, created_at)` on `orders`, index on `orders.customer_phone` (used by `orders/track:56`).
2. **N+1 writes** — `shipping/route.ts:313-355`: one UPDATE per order in a loop, no transaction, unguarded `generateTrackingNumber()` collisions. → single `UPDATE … WHERE id = ANY($1)` in a tx.
3. **Write amplification on reads** — `orders/route.ts:63` runs bulk `expireStaleCodVerifications()` on **every GET**; `dashboard/layout` re-fetches; move to a schedule/once-per-minute.
4. **Per-request DB query in middleware** — `middleware.ts:143-164` hits the DB on every API request with no caching; document that middleware is **not** an auth layer (no `/api/*` authentication at line 229 — any route missing `getSession()` is public) and add a fail-closed assertion/test for new routes.
5. **`ResilientPool` cold-start behavior** — `db/index.ts:107-131,177-252` builds 68 fallback hosts and probes 12 in parallel; caches the winning config and caps fallbacks; prefer the pooler host.
6. **Rate limiting → shared store** — move to Redis/Upstash (or platform rate limiting); resolve client IP only from trusted-proxy headers.
7. **Dead code to remove** — `lib/order-metrics.ts:33-36` raw-SQL `revenueWhereClause` (0 call sites), `analytics:69-70` unused `todayStart`, `products:13` unused `storeId` param, `credits/route.ts:1` unused import, `activate-addon:72-77` unreachable branch, `paywall.ts` unused gate exports (or wire them up — see ⚠️#5).
8. **Idempotency** — accept `Idempotency-Key` on checkout; add `deduction_key UUID UNIQUE` to `store_credits`; `ON CONFLICT DO NOTHING` for slug/code/domain creation instead of check-then-insert races (`stores:62-74`, `admin/codes:132-175`, `loyalty ensureProgram:84-100`), and inspect the PG `constraint` name before mapping `23505` (any unique violation currently reported as `DUPLICATE_SLUG`).
9. **Security hygiene** — constant-time compare for WhatsApp verify-token (`webhooks/whatsapp:54`); `filename*=UTF-8''` sanitization for AWB `Content-Disposition` (`awb/[orderId]:48,54`); add `SUPABASE_SERVICE_ROLE_KEY`/`SOCIAL_APP_SECRET` to `.env.example` **with the webhook failing closed when absent**; token version/`jti` denylist so logout actually revokes (7-day JWT otherwise valid); derive `role` from DB per request.
10. **Testing gap** — zero tests. Highest-value suites: (a) tenant-isolation property test across every route (RLS is bypassed app-wide since the app connects as superuser `postgres`, `db/index.ts:281` + `.env.example:3` — all isolation is hand-written `WHERE store_id`); (b) price-recompute checkout tests; (c) credit deduct/ledger/rollback tests; (d) order state-machine matrix tests including the case normalization.
11. **What's already good** (keep it): atomic conditional deduction `UPDATE … WHERE credits >= cost` (`paywall.ts:307-311`); atomic voucher claim `WHERE isUsed=false` (`redeem-code:97-111`); consistent `store_id` scoping in app queries; no SQL injection found (all drizzle-parameterized); no `client.release()` leaks; Zod used correctly in `checkout`, `orders` POST, `verify-cod`, `shipping/integrations`; POS recomputes prices + atomic `gte(stock)` guard; `orders` status updates use `SELECT … FOR UPDATE`; shipping integration secrets masked/encrypted; WhatsApp webhook fails closed; en↔ar dictionary parity exact; `t` memoized (no dep-loop risk); realtime unmount cleanup correct.

---

## PRIORIZED FIX ORDER

| # | Item | Effort |
|---|------|--------|
| 1 | C2 checkout price/product recompute (revenue loss now) | S |
| 2 | C4+C5 auth on verify-cod/cancel + fail-closed webhooks | S |
| 3 | C1 add Stripe webhook `POST` + signature verify | S |
| 4 | C3 replace header-based admin auth with `ADMIN_TOKEN` | S |
| 5 | C8 status enum + backfill (fixes cancel, stats, Stripe, realtime, badges in one pass) | M |
| 6 | C6 thread `tx` through `grantCredits`/`upsertAddOn`/`recordCreditUsage`; add refund path | S |
| 7 | C7 RLS migration for all 25 tables + drop `WITH CHECK (true)` | M |
| 8 | ⚠️5 wire paywall gates into middleware; ⚠️1 meter all 4 WhatsApp send paths | M |
| 9 | 🎨1-5 dead UI features (settings save, Stripe panel, currency, placeholder URL) | M |
| 10 | 🎨6 shared fetch wrapper + error boundaries + i18n dynamic-key typing | M |
| 11 | DB: migration ledger + transactions, CHECK constraints, pool limits, `analytics` INTERVAL fix | M |
| 12 | Pagination, rate-limit store, RTL/a11y sweep | L |

**Legend:** S = < half day · M = 1–3 days · L = 1+ week
