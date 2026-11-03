# StoreHub — Security & Vulnerability Audit

**Scope:** `multi-tenant-e-commerce-saas-mvp` (Next.js 16 App Router, Drizzle ORM + PostgreSQL/Supabase, Stripe/Paddle, WhatsApp/Meta, carrier webhooks)
**Type:** Read-only source review. No application code was modified.
**Date:** 2026-11-02

---

## 1. Executive summary

The codebase has several good security foundations: parameterized Drizzle queries (no SQL injection found), bcrypt password hashing, HMAC/timing-safe webhook verification that fails closed, constant-time admin-token comparison, and `SameSite=Lax` session cookies. Checkout also correctly re-prices line items from the database instead of trusting the client's `unitPrice`.

However, the platform has **three critical issues** that can lead to cross-tenant data exposure or direct financial loss:

1. **RLS is missing on almost every tenant table, while the public Supabase anon key is shipped to browsers.** Migrations `0004`–`0018` create `customers`, `coupons`, `activation_codes`, `social_channels`, `shipping_integrations`, `store_credits`, etc. without `ENABLE ROW LEVEL SECURITY`. With Supabase's default `anon`/`authenticated` grants, anyone holding the public anon key can read/write those tables directly through PostgREST.
2. **Checkout trusts the client-selected currency without converting the amount.** The server re-prices from the DB in the store's base currency, but passes the client's `currency` straight to Stripe/Paddle with the unchanged numeric amount. A buyer can select a cheaper supported currency and pay the base-currency number in it.
3. **Order tracking, cancellation, and COD confirmation are only protected by an order UUID + public store slug/phone.** The tracking endpoint discloses order IDs and full customer PII by phone number; the cancel/COD endpoints then accept that order ID as proof of ownership.

The app's Drizzle connection also uses the `postgres` database role (per `.env.example`), which has `BYPASSRLS`. That means **RLS is not a defense-in-depth layer for server queries** — every tenant boundary depends on application code being correct.

### Finding count

| Severity | Count |
|---|---:|
| Critical | 3 |
| High | 7 |
| Medium | 10 |
| Low | 8 |

### Top 5 actions

1. Enable RLS on **every** tenant table and revoke direct `anon`/`authenticated` grants on server-only tables.
2. Remove client control of currency: pin it to `stores.currency` or convert server-side with a trusted rate.
3. Replace `orderId + slug/phone` with a signed, expiring per-order token for tracking/cancel/COD links.
4. Remove the anonymous `INSERT` policies on `orders`/`order_items`.
5. Stop letting merchants set `stripeAccountId`/`paddleVendorId`/`stripeEnabled` through the generic store update.

---

## 2. Severity definitions

| Severity | Meaning |
|---|---|
| **Critical** | Direct cross-tenant compromise, authentication bypass, or direct monetary loss with no special access. |
| **High** | Serious data exposure or business-logic abuse exploitable by a normal user/attacker with modest effort. |
| **Medium** | Meaningful weakness that needs additional conditions, or defense-in-depth failure. |
| **Low** | Hardening/configuration issue, information leak, or best-practice gap. |

---

## 3. Critical findings

### C-1 — Missing RLS on tenant tables + public anon key = cross-tenant read/write

**Area:** Database / tenant isolation
**Files:**
- `supabase/schema.sql:88-93` (RLS enabled only on `users`, `stores`, `categories`, `products`, `orders`, `order_items`)
- `supabase/migrations/0002_users_table.sql:35` (only `users`)
- `supabase/migrations/0004_add_currency_column.sql` (`activation_codes`)
- `supabase/migrations/0005_promotions_coupons.sql` (`promotions`, `coupons`)
- `supabase/migrations/0006_shipping_labels.sql` (`shipping_zones`)
- `supabase/migrations/0007_abandoned_carts.sql` (`abandoned_carts`)
- `supabase/migrations/0009_loyalty_vip.sql` (`loyalty_settings`, `vip_tiers`, `customers`, `loyalty_transactions`)
- `supabase/migrations/0010_multi_warehouse_stock.sql` (`warehouses`, `warehouse_stock`, `stock_transfers`)
- `supabase/migrations/0011_addons_credits_paywall.sql` (`store_add_ons`, `store_credits`)
- `supabase/migrations/0013_activation_code_pricing.sql` (`activation_code_pricing`)
- `supabase/migrations/0016_order_status_logs.sql` (`order_status_logs`)
- `supabase/migrations/0017_multi_carrier_shipping.sql` (`shipping_integrations`)
- `supabase/migrations/0018_ai_social_selling.sql` (`social_channels`, `ai_chat_sessions`)
- `src/lib/supabase/server.ts:44-66` (mints `authenticated` JWTs)
- `.env.example:23-24` (public anon key)

**Description:** None of the tables created by migrations `0004`–`0018` enable RLS. The browser receives `NEXT_PUBLIC_SUPABASE_ANON_KEY` and can call the Supabase REST API directly. Supabase's default grants allow the `anon` and `authenticated` roles to select/insert/update/delete rows in `public` tables unless those grants were explicitly revoked.

**Impact:** An unauthenticated attacker with the anon key (visible in the client bundle) can attempt to read every row of every non-RLS table:

- `customers` — names, phones, emails, lifetime spend, loyalty data
- `abandoned_carts` — cart contents + recovery tokens + contact data
- `social_channels` / `shipping_integrations` — encrypted page/carrier credentials
- `activation_codes` — unredeemed vouchers (direct revenue theft)
- `store_credits` / `store_add_ons` — billing ledger and entitlements
- `warehouse_stock` / `stock_transfers` — inventory data
- `order_status_logs` — audit history

It can also write/delete those rows if default grants are present. The app's own connection being `postgres` (`src/db/index.ts:5-13`, `.env.example:4`) means RLS does not protect server queries either; a single missed `WHERE store_id = ...` becomes a cross-tenant leak.

**Evidence (illustrative, run only against your own project):**

```bash
curl "https://<project>.supabase.co/rest/v1/customers?select=*&limit=1" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

If this returns rows, the finding is confirmed.

**Fix:**
1. Enable RLS on **every** tenant table, e.g.:
   ```sql
   ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
   ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
   -- ...all tables from 0004–0018
   ```
2. Add explicit policies, scoped through the owning store:
   ```sql
   CREATE POLICY customers_owner_all ON customers
     USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()))
     WITH CHECK (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));
   ```
3. **Revoke** direct access to server-only tables from `anon`/`authenticated`:
   ```sql
   REVOKE ALL ON customers, coupons, activation_codes, store_credits,
     social_channels, shipping_integrations, abandoned_carts
     FROM anon, authenticated;
   ```
   Only expose what the browser genuinely needs (e.g. Storage objects, Realtime on `orders`) through narrow policies.
4. Run the application as a **non-BYPASSRLS** role and set a per-request tenant context (`SET LOCAL app.current_store_id`), or keep the privileged role but treat every query as tenant-scoped and add automated tests that assert `store_id` filters.
5. Audit existing data for unauthorized access before/after the fix.

---

### C-2 — Checkout currency is client-controlled and never converted

**Area:** Payment / price tampering
**Files:**
- `src/app/api/checkout/route.ts:124-130` (only checks `supportedCurrencies.includes(currency)`)
- `src/app/api/checkout/route.ts:346-357` (passes client `currency` to Stripe)
- `src/app/api/checkout/route.ts:405-415` (same for Paddle)
- `src/lib/payments/stripe.ts:3` (`convertAmount` imported but unused)
- `src/lib/payments/stripe.ts:90-102` (`unit_amount` from base-currency `unitPrice`, Stripe currency from client)
- `src/lib/payments/paddle.ts:64-69` (same pattern)
- `src/lib/validators.ts:22` (`currency: z.string().length(3)`)

**Description:** Line items are correctly re-priced from `products.price` (`checkout/route.ts:139-178`), but the numeric amount is in the store's base currency. The request's `currency` is accepted if it appears in `store.supportedCurrencies`, then forwarded unchanged to the payment provider. No FX conversion is applied, even though `convertAmount` exists and is imported.

**Impact:** A buyer can choose a different supported currency and pay the base-currency number in it. Example: a store priced in USD that also lists EGP — a $100 product becomes `100 EGP` (≈ $2). Conversely, a store priced in EGP that lists USD would overcharge, causing disputes/refunds. The stored `orders.total_amount` also no longer matches the amount actually captured, breaking reconciliation and the Stripe webhook's “paid” transition.

**Fix:**
- Treat `stores.currency` as authoritative. Ignore/validate the client currency and always charge `store.currency`; or
- Convert server-side with a cached, trusted rate at checkout time, store the rate + charged amount + currency on the order, and pass the converted minor units to Stripe/Paddle.
- In the Stripe webhook, verify `session.amount_total` and `session.currency` against the order before marking it paid.
- Remove the unused `convertAmount` import or wire it in.

---

### C-3 — Order UUID + public slug/phone is treated as proof for cancel/COD/tracking

**Area:** API authorization / business logic
**Files:**
- `src/app/api/orders/cancel/route.ts:11-45` (no session, no signed token)
- `src/app/api/orders/verify-cod/route.ts:54-93` (public; `order_id` + `store_slug` only)
- `src/app/api/orders/track/route.ts:8-58` (public phone/order lookup)
- `src/app/api/storefront/orders/track/route.ts:9-81` (public phone/order lookup)
- `src/app/api/webhooks/whatsapp/route.ts:94-110` (applies any signed button reply by `orderId`)

**Description:** Customer-facing order actions are authorized only by knowledge of an order UUID and a public store slug (cancel, COD) or a phone number (tracking). There is no signed per-order token, no OTP, and no authenticated customer account. The tracking endpoints expose full order rows, including the order ID, so the chain is:

1. Know a victim's phone number (not secret) and a store slug (public).
2. `GET /api/storefront/orders/track?slug=<slug>&phone=<phone>` → returns the full order and its `id`.
3. `POST /api/orders/cancel` with `{ orderId, storeSlug }` → cancels the victim's pending order; or
4. `POST /api/orders/verify-cod` with `{ order_id, status: "CANCELLED"|"CONFIRMED", store_slug }` → changes COD state.

**Impact:** Unauthorized cancellation/confirmation of orders, inventory restock side effects, business disruption, and PII disclosure. The cancel endpoint is also unauthenticated and has no rate limit.

**Fix:**
- Add an HMAC-signed, expiring token to every customer link: `HMAC(orderId + storeId + purpose + exp, ORDER_LINK_SECRET)`. Verify it in track/cancel/verify-cod.
- Alternatively require the phone number **and** a one-time code sent to that phone/email before cancel/confirm.
- Return only a minimal projection from tracking (status, totals, item names, shipping ETA) — never the full row.
- Rate-limit and log all order-action attempts by IP + order ID.

---

## 4. High findings

### H-1 — Anonymous `INSERT` policies on `orders` / `order_items`

**Files:** `supabase/schema.sql:150-151`, `supabase/schema.sql:165-166`
**Description:** `Orders public insert` and `Order items public insert` use `WITH CHECK (true)`. Combined with the public anon key, anyone can create arbitrary orders and order items directly through PostgREST.
**Impact:** Fake orders, analytics/revenue pollution, inventory/risk-engine poisoning, dashboard spam, and potential realtime notification abuse. The attacker cannot read the rows back (the owner-read policy applies), but writes are unrestricted.
**Fix:** Drop both policies. Perform checkout only through the server (privileged DB role). If direct inserts are truly required, constrain them:
```sql
WITH CHECK (
  status = 'PENDING'
  AND total_amount >= 0
  AND EXISTS (SELECT 1 FROM stores s WHERE s.id = store_id)
)
```
and never allow arbitrary `unit_price`/`total_amount`.

---

### H-2 — Public order tracking returns full customer PII

**Files:** `src/app/api/orders/track/route.ts:94-99`, `src/app/api/storefront/orders/track/route.ts:120-130`
**Description:** Both endpoints return `{ ...order }`, including customer name, phone, address, email, notes, risk score/reasons, COD status, and payment references. Lookup requires only a phone number or order UUID plus the public slug.
**Impact:** Anyone who knows a phone number can retrieve that customer's delivery address and order history for a store. This is a privacy/GDPR-style exposure and enables the C-3 attack chain.
**Fix:** Return a DTO with only `id`, `status`, `total`, `currency`, `createdAt`, item names/quantities, and shipping status. Require order ID **and** a second factor (phone last 4 or email) for PII-bearing views. Add rate limiting.

---

### H-3 — Billing add-ons can be enabled without payment

**Files:** `src/app/api/billing/addons/route.ts:27-109`
**Description:** Any authenticated store owner can `POST /api/billing/addons` with `{ addOn: "white_label", enabled: true }` or `{ addOn: "staff_seats", quantity: N }`. The handler writes `stores.has_white_label` / `stores.max_staff_seats` and `store_add_ons` directly. The comment says “mock billing: no payment provider attached.”
**Impact:** Free access to paid entitlements (white-label branding, extra staff seats) and permanent entitlement drift. If this endpoint is present in production, it is a direct revenue bypass.
**Fix:** Gate the endpoint behind a completed payment/activation-code flow. Remove it from production builds or protect it with an admin token. Recompute entitlements from payment records, not from a client request.

---

### H-4 — Merchants can set payment-routing fields through the generic store update

**Files:** `src/lib/store-update.ts:17-29`, `src/app/api/stores/route.ts:126-155`, `src/app/api/stores/[id]/route.ts:68-87`, `src/lib/payments/stripe.ts:152-164`
**Description:** `TEXT_FIELDS` includes `stripeAccountId` and `paddleVendorId`; `BOOLEAN_FIELDS` includes `stripeEnabled` and `paddleEnabled`. Any owner can PATCH these values. Checkout then uses `stripeAccountId` as `payment_intent_data.transfer_data.destination` and as the `stripeAccount` request option.
**Impact:** A merchant can point their checkout at an arbitrary Stripe account, enable Stripe without completing onboarding (causing failed charges), or set an arbitrary Paddle vendor ID. This breaks payout integrity and can be used for fraud/chargeback laundering. It also bypasses the Stripe Connect OAuth/`account.updated` flow.
**Fix:** Remove these fields from the user-editable allowlist. Set them only from the Stripe Connect callback after verifying the account belongs to the store, and set `stripeEnabled`/`paddleEnabled` from provider webhooks. Validate account IDs against the provider before persisting.

---

### H-5 — Abandoned-cart takeover via phone/email lookup

**Files:** `src/app/api/storefront/abandoned-carts/route.ts:211-258`
**Description:** On a returning-guest save, the endpoint finds the latest `pending` cart by `customerPhone` **or** `customerEmail` and returns its `recoveryToken` in the response. No OTP or signed proof is required.
**Impact:** An attacker who knows a victim's phone/email can obtain the recovery token, overwrite the cart, mark it recovered, and potentially read the cart through the recovery flow. Cart contents and contact data can be hijacked; recovery coupons can be abused.
**Fix:** Never return a recovery token based solely on a phone/email match. Require an OTP or a signed link delivered to the contact. Store only a hash of the recovery token and compare in constant time. Rate-limit lookups per IP and per contact.

---

### H-6 — Unauthenticated COD confirmation/cancellation

**Files:** `src/app/api/orders/verify-cod/route.ts:40-93`, `src/app/api/orders/cancel/route.ts:11-45`
**Description:** Both endpoints are intentionally public (customer links), but the only proof is `orderId` + `storeSlug`. There is no signed token, no customer authentication, and no binding to the phone that received the WhatsApp message.
**Impact:** Anyone with an order UUID can confirm a fraudulent COD order (so it ships) or cancel a legitimate one. Combined with H-2/C-3, order UUIDs are discoverable from a phone number.
**Fix:** Use a signed per-order token in the WhatsApp button/link (see C-3). Verify the token’s purpose (`confirm`/`cancel`) and expiry. For the WhatsApp webhook, also verify `message.from` matches the order’s normalized customer phone and that the receiving `phone_number_id` belongs to the order’s store.

---

### H-7 — Application DB role bypasses RLS (tenant isolation is app-only)

**Files:** `src/db/index.ts:5-13`, `src/db/index.ts:124-127`, `.env.example:4`
**Description:** `DATABASE_URL` is documented and used as `postgresql://postgres:...`, and the fallback pooler configs also use `user: "postgres"`. PostgreSQL’s `postgres` role has `BYPASSRLS`, so every Drizzle query ignores the RLS policies in `schema.sql`. The `.env.local` inspected during this audit uses such a connection string.
**Impact:** RLS provides no protection against a missed tenant filter in application code. The only barrier between tenants is manual `WHERE store_id = ...` discipline, which is error-prone (several routes already rely on `session.storeId`/owner lookups rather than a DB-enforced policy).
**Fix:** Create a dedicated `storehub_app` role with `NOBYPASSRLS`, grant only required DML, and set `app.current_store_id` per request/transaction via `SET LOCAL`. Update RLS policies to use `current_setting('app.current_store_id')::uuid`. Keep the `postgres` role for migrations/admin jobs only. Add integration tests that query as the app role and assert cross-tenant reads fail.

---

## 5. Medium findings

### M-1 — Public slug endpoints leak the full store row and hidden products

**Files:** `src/app/api/products/route.ts:18-47`, `src/app/api/categories/route.ts:14-19`
**Description:** `GET /api/products?slug=<slug>` does `select()` on `stores` and returns the entire row, including `ownerId`, `stripeAccountId`, `paddleVendorId`, `plan`, `planExpiresAt`, credit balances, `customDomain`, and internal flags. The same pattern exists in `/api/categories?slug=`. The products query only filters `isVisible` when `visible=true`, so omitting the parameter returns hidden/draft products.
**Impact:** Information disclosure of tenant identifiers, payment account IDs, plan/billing state, and unpublished catalog data.
**Fix:** Map to an explicit public DTO (`id`, `name`, `slug`, `description`, `logoUrl`, `coverUrl`, `currency`, `supportedCurrencies`, `themeConfig`, `hasWhiteLabel`). Always filter `isVisible = true` for public slug requests.

### M-2 — Hardcoded fallback encryption keys

**Files:** `src/lib/social-crypto.ts:18-24`, `src/lib/shipping-crypto.ts:16-25`
**Description:** If `SOCIAL_ENCRYPTION_KEY` / `SHIPPING_ENCRYPTION_KEY` are unset, the code falls back to `JWT_SECRET` and then to public literals (`storehub-social-fallback-key`, `storehub-shipping-fallback-key`).
**Impact:** If the fallback is used, anyone with the source code can decrypt stored social/carrier credentials after a DB leak. Coupling to `JWT_SECRET` also means rotating sessions breaks stored secrets (or forces key reuse).
**Fix:** Fail closed in production when the dedicated key is missing. Use a KMS/secret manager and a versioned key ID in the envelope. Rotate existing ciphertexts after setting strong keys.

### M-3 — Rate limiting is in-memory and spoofable

**Files:** `src/lib/rate-limit.ts:15`, `src/lib/rate-limit.ts:31-35`
**Description:** The limiter stores counters in a per-process `Map` and keys on the first `x-forwarded-for` value, which is client-controlled on many deployments. On serverless/multi-instance deployments, each instance has its own counters.
**Impact:** Login/signup brute force, COD verify abuse, coupon enumeration, and activation-code brute force can bypass limits by spoofing `X-Forwarded-For` or hitting different instances. `redeem-code`, `activate-addon`, `coupons/validate`, tracking, and abandoned carts have no limiter at all.
**Fix:** Use a shared store (Redis/Upstash) and a trusted client IP from the platform (e.g. `x-vercel-forwarded-for` / `request.ip`). Add per-account and per-code throttles, not just per-IP. Add exponential backoff/lockout for failed logins and code redemptions.

### M-4 — Stateless 7-day JWT with no revocation

**Files:** `src/lib/auth.ts:38-62`, `src/app/api/auth/logout/route.ts:3-6`, `src/proxy.ts:189-391`
**Description:** Sessions are HS256 JWTs valid for 7 days, containing `id`, `email`, `name`, `storeId`, `storeSlug`, `storeName`, and `role`. There is no `jti`, issuer/audience check, or server-side session record. Logout only deletes the cookie.
**Impact:** A stolen token remains valid for up to 7 days even after logout, password change, role downgrade, or store transfer. Role/store claims can be stale. If `JWT_SECRET` is reused as the encryption fallback (M-2), key rotation is harder.
**Fix:** Short-lived access tokens (15–60 min) + rotating refresh tokens, or a server-side session table with revocation. Include `jti` and check a denylist. Re-validate the user/store on sensitive actions. Use `__Host-` cookie prefix, `SameSite=Strict` for dashboard routes, and rotate `JWT_SECRET` separately from encryption keys.

### M-5 — Merchant order creation trusts client prices and product IDs

**Files:** `src/app/api/orders/route.ts:180-240`, `src/lib/validators.ts:32-47`
**Description:** `POST /api/orders` requires a session and a matching `storeId`, but computes `totalAmount` from `item.unitPrice`, inserts `order_items` with that price, and never verifies that the products belong to the store or exist. `paymentMethod` is arbitrary.
**Impact:** A store owner/staff member can create fake orders with arbitrary totals, pollute analytics/revenue reports, deduct arbitrary warehouse stock, and trigger COD verification/WhatsApp credits. This is an insider/business-logic issue rather than cross-tenant, but it corrupts financial data.
**Fix:** Re-price from `products` scoped to `storeId` (reuse the checkout helper), reject unknown/foreign products, validate stock, and restrict `paymentMethod` to an allowlist appropriate to the merchant. Prefer a shared `createOrder` service for both checkout and merchant-created orders.

### M-6 — Product/category/coupon writes lack schema validation

**Files:** `src/app/api/products/route.ts:85-146`, `src/app/api/products/route.ts:173-191`, `src/app/api/categories/route.ts:62-120`
**Description:** Product `POST`/`PATCH` destructure raw JSON. `price` is coerced with `String(price)` (objects become `"[object Object]"`, numbers can be negative/NaN), `stock` is stored as-is (negative or non-integer), `categoryId` is not checked against the store, and `name` has no length limit. Categories have similar gaps.
**Impact:** Corrupted catalog data, checkout failures (`NaN` totals), negative prices/stock, cross-store category references, and large-payload DoS.
**Fix:** Add Zod schemas with `price: z.number().nonnegative().finite()`, `stock: z.number().int().nonnegative()`, `name: z.string().min(1).max(200)`, `categoryId: z.string().uuid().optional()`. Verify `categoryId` belongs to the same store. Add DB `CHECK` constraints as a second layer.

### M-7 — Unbounded cart size/quantity

**Files:** `src/lib/validators.ts:3-30`
**Description:** `quantity` is a positive integer with no maximum; `items` has no maximum length. `totalAmount` is a JS number and later formatted into PostgreSQL `numeric`/Stripe `unit_amount`.
**Impact:** Integer/`numeric` overflow, Stripe `unit_amount` overflow errors, memory/CPU exhaustion from very large carts, and potential denial of checkout.
**Fix:** Cap `quantity` (e.g. ≤ 1,000), `items.length` (e.g. ≤ 100), and the computed total. Reject values outside safe-integer range. Add a server-side per-store cart limit.

### M-8 — WhatsApp COD webhook does not bind sender/number to the order

**Files:** `src/app/api/webhooks/whatsapp/route.ts:88-118`, `src/lib/orders/cod-verification.ts:68-78`
**Description:** After signature verification, the handler parses `COD_CONFIRM_<orderId>` / `COD_CANCEL_<orderId>` from any button reply and applies the decision. It does not check `message.from` against `orders.customer_phone`, nor that the receiving `metadata.phone_number_id` belongs to the order's store.
**Impact:** If a WhatsApp number is shared across stores, or if a signed payload is replayed/forged by an insider with the app secret, one sender can confirm/cancel another order. In a multi-tenant single-number setup this is a cross-tenant action.
**Fix:** Load the order first; verify the normalized sender phone equals `orders.customer_phone`; verify the receiving phone-number ID maps to the order's store; verify the order is COD and still `PENDING_VERIFICATION`. Log the sender/number with the decision.

### M-9 — No security headers / CSP

**Files:** `next.config.ts` (no `headers()`), no middleware header injection
**Description:** The app does not set `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, or `Permissions-Policy`.
**Impact:** Increased impact of any XSS, clickjacking of dashboard/admin pages, MIME sniffing, and referrer leakage (including the admin token on the bootstrap URL).
**Fix:** Add a `headers()` block in `next.config.ts` with at least `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`), HSTS in production, and a restrictive CSP. Test the CSP against Stripe/WhatsApp/Meta integrations.

### M-10 — Loyalty phone lookup discloses member profile

**Files:** `src/app/api/storefront/loyalty/route.ts:48-103`
**Description:** `GET /api/storefront/loyalty?slug=<slug>&phone=<phone>` returns the matching customer's `name`, loyalty points, and lifetime spend. It is public and unrate-limited.
**Impact:** Anyone who knows a phone number can confirm store membership and spending level; useful for social engineering and customer profiling.
**Fix:** Require an OTP/authenticated session for profile data, or return only a boolean/points preview after checkout. Rate-limit per IP and per phone.

---

## 6. Low findings

### L-1 — Admin token accepted via query string
**File:** `src/proxy.ts:285-329`
The `?admin_token=` bootstrap is stripped after setting an httpOnly cookie, but the first request can still land in browser history, proxy logs, and `Referer` headers. Prefer a POST form or a one-time short-lived code.

### L-2 — Development admin fallback
**File:** `src/lib/admin.ts:47-49`
When `NODE_ENV !== "production"` and `ADMIN_TOKEN` is unset, all admin surfaces are open. A staging deployment with `NODE_ENV=development` would be publicly accessible. Require an explicit `ALLOW_DEV_ADMIN=true` and bind the fallback to loopback.

### L-3 — Debug logs are tracked in git
**Files:** `dev.log`, `devserver.log`
No live secrets were found in a sampled scan, but request logs should not be versioned. Remove them from git, add them to `.gitignore`, and rotate any credentials that may ever have been printed.

### L-4 — Weak password policy and user enumeration
**Files:** `src/app/api/auth/signup/route.ts:120-125`, `src/app/api/auth/signup/route.ts:14-18`
Minimum password length is 6, there is no email verification or MFA, and a duplicate email returns a distinct `DUPLICATE_EMAIL` 409. Raise the minimum (12+), add breached-password checks, verify email ownership, and return a generic response for duplicate signups.

### L-5 — Error responses leak database state
**Files:** `src/app/api/auth/signup/route.ts:9-73`, `src/lib/errors.ts:123-183`
Responses distinguish missing tables, permission denied, invalid database, and unreachable database. This aids reconnaissance. Log details server-side and return a generic 500/503 to clients.

### L-6 — Stripe webhook does not verify amount/currency
**File:** `src/app/api/webhooks/stripe/route.ts:96-130`
The handler marks an order paid based on metadata and `payment_status`, without comparing `session.amount_total`/`currency` to the order. Combined with C-2, reconciliation is unreliable. Verify the captured amount and currency before transitioning to paid.

### L-7 — Promotion PATCH does not re-validate date ordering
**File:** `src/app/api/promotions/route.ts:225-244`
`POST` enforces `end > start`, but `PATCH` can set `endTime` before the existing `startTime` (or vice versa). Re-validate the combined values before update, and constrain `targetProductIds`/`targetCategoryIds` to the store.

### L-8 — DB TLS certificate validation disabled
**File:** `src/db/index.ts:89`
`ssl: { rejectUnauthorized: false }` accepts any certificate for remote PostgreSQL. Use `sslmode=verify-full` with the Supabase CA, or at least `rejectUnauthorized: true` where supported.

### L-9 — Pooler fallback sprays the DB password across regions
**File:** `src/db/index.ts:119-130`
The fallback list includes `user: "postgres"` and the same password for every `aws-{0,1}-<region>.pooler.supabase.com` host. If the primary host is unreachable, the app sends credentials to many third-party endpoints. Restrict fallbacks to the project's known region(s) and never fall back to a generic `postgres` user.

### L-10 — Unused FX conversion import
**File:** `src/lib/payments/stripe.ts:3`
`convertAmount` is imported but never called. This is a code smell that likely reflects the missing conversion in C-2; remove it or use it.

---

## 7. RLS coverage matrix

| Table | Created in | RLS enabled? | Notes |
|---|---|---|---|
| `users` | `schema.sql`, `0002` | Yes | `Users can read own` only |
| `stores` | `schema.sql` | Yes | `SELECT USING (true)` — exposes all columns via PostgREST |
| `categories` | `schema.sql` | Yes | Public read; owner CRUD |
| `products` | `schema.sql` | Yes | Public read `is_visible = true`; owner CRUD |
| `orders` | `schema.sql` | Yes | **`public insert WITH CHECK (true)`** |
| `order_items` | `schema.sql` | Yes | **`public insert WITH CHECK (true)`** |
| `activation_codes` | `0004` | **No** | Voucher theft if anon can read |
| `promotions` | `0005` | **No** | — |
| `coupons` | `0005` | **No** | — |
| `shipping_zones` | `0006` | **No** | — |
| `abandoned_carts` | `0007` | **No** | PII + recovery tokens |
| `loyalty_settings` | `0009` | **No** | — |
| `vip_tiers` | `0009` | **No** | — |
| `customers` | `0009` | **No** | PII |
| `loyalty_transactions` | `0009` | **No** | — |
| `warehouses` | `0010` | **No** | — |
| `warehouse_stock` | `0010` | **No** | — |
| `stock_transfers` | `0010` | **No** | — |
| `store_add_ons` | `0011` | **No** | Entitlements |
| `store_credits` | `0011` | **No** | Billing ledger |
| `activation_code_pricing` | `0013` | **No** | — |
| `order_status_logs` | `0016` | **No** | Audit trail |
| `shipping_integrations` | `0017` | **No** | Carrier credentials |
| `social_channels` | `0018` | **No** | Social credentials |
| `ai_chat_sessions` | `0018` | **No** | Conversation data |

---

## 8. What is working well

- **No SQL injection found.** Drizzle query builders and parameterized `sql` templates are used throughout. No string-concatenated SQL.
- **Checkout re-pricing is correct.** Client `unitPrice` is ignored; products are re-fetched scoped to the store and duplicates merged (`checkout/route.ts:135-178`).
- **Webhook verification is fail-closed.** Stripe uses `constructEvent`; WhatsApp/social use HMAC-SHA256 with `timingSafeEqual`; carrier webhooks reject unsigned deliveries when no secret is configured. The social `simulation` path is reached only after signature verification.
- **Admin authorization is constant-time and fails closed in production** (`src/lib/admin.ts`), and `/admin` uses `notFound()` when unauthorized.
- **Passwords are bcrypt-hashed** with cost 10 (`src/lib/auth.ts:25-35`).
- **Session cookie is `httpOnly`, `secure` in production, `SameSite=Lax`**, which mitigates most cross-site POST CSRF.
- **No permissive CORS** (`Access-Control-Allow-Origin`) was found; Next.js defaults apply.
- **`dangerouslySetInnerHTML` usages are safe**: JSON-LD escapes `<`, and the other uses are static `<style>`/inline scripts.
- **Coupon and COD state changes use transactions/atomic claims**, preventing double redemption and double restock in the normal paths.

---

## 9. Prioritized remediation roadmap

### Immediate (before any public production use)
1. Enable RLS on all tables listed in §7 and revoke `anon`/`authenticated` grants on server-only tables (C-1).
2. Drop the anonymous `orders`/`order_items` insert policies (H-1).
3. Pin checkout currency server-side or convert with a trusted rate; verify amounts in the Stripe webhook (C-2, L-6).
4. Replace order-UUID-only cancel/COD/tracking with signed, expiring tokens; minimize tracking responses (C-3, H-2, H-6).
5. Remove/gate `POST /api/billing/addons` (H-3).
6. Remove `stripeAccountId`/`paddleVendorId`/`stripeEnabled`/`paddleEnabled` from the user-editable store update (H-4).

### Short term (next sprint)
7. Require OTP/signed proof for abandoned-cart recovery (H-5).
8. Move the app to a non-BYPASSRLS DB role with per-request tenant context (H-7).
9. Add explicit public DTOs for slug endpoints; filter hidden products (M-1).
10. Require encryption keys in production; remove hardcoded fallbacks (M-2).
11. Replace in-memory rate limiting with a shared store; add limits to redeem/activate/coupon/tracking (M-3).
12. Shorten sessions, add revocation, and rotate secrets (M-4).

### Medium term
13. Re-price merchant-created orders and validate product/store/stock (M-5).
14. Add Zod schemas + DB constraints for products/categories/coupons (M-6).
15. Cap cart quantities/items (M-7).
16. Bind WhatsApp COD decisions to sender + receiving number (M-8).
17. Add security headers/CSP (M-9).
18. Require OTP for loyalty profile lookups (M-10).

### Hardening
19. Harden admin token bootstrap and dev fallback (L-1, L-2).
20. Remove tracked logs, raise password policy, add email verification/MFA (L-3, L-4).
21. Generic error responses (L-5).
22. Fix promotion PATCH validation and DB TLS/pooler fallbacks (L-7, L-8, L-9).

---

## 10. Verification checklist (post-fix)

- [ ] `SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=false;` returns no tenant tables.
- [ ] Anon-key requests to `customers`, `coupons`, `activation_codes`, `social_channels`, `shipping_integrations`, `store_credits` return `401`/empty.
- [ ] Anonymous `POST /rest/v1/orders` is rejected.
- [ ] Checkout with `currency` different from `stores.currency` either rejects or charges the converted amount; the Stripe session amount equals the order total.
- [ ] Tracking with only a phone number returns no address/email/notes.
- [ ] Cancel/COD with a forged/expired token returns `401`/`403`.
- [ ] `POST /api/billing/addons` cannot enable an add-on without a payment/code.
- [ ] Store PATCH ignores `stripeAccountId`, `paddleVendorId`, `stripeEnabled`, `paddleEnabled`.
- [ ] Rate limits hold across instances and with spoofed `X-Forwarded-For`.
- [ ] Logout invalidates the token server-side.
- [ ] Security headers present on `/`, `/dashboard`, `/admin`.

---

*End of report.*
