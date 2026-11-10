import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  primaryKey,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ============================================
// USERS
// ============================================
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ============================================
// STORES
// ============================================
export const stores = pgTable(
  "stores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").unique().notNull(),
    description: text("description").default(""),
    category: text("category").default(""),
    logoUrl: text("logo_url").default(""),
    coverUrl: text("cover_url").default(""),
    phone: text("phone").default(""),
    address: text("address").default(""),
    plan: text("plan").notNull().default("free"),
    accentColor: text("accent_color").default(""),
    customDomain: text("custom_domain").unique(),
    customDomainVerified: boolean("custom_domain_verified").default(false),
    currency: text("currency").default("EGP"),
    supportedCurrencies: jsonb("supported_currencies").$type<string[]>().default(["EGP", "USD", "SAR", "AED", "EUR"]),
    stripeAccountId: text("stripe_account_id"),
    stripeEnabled: boolean("stripe_enabled").default(false),
    paddleVendorId: text("paddle_vendor_id"),
    paddleEnabled: boolean("paddle_enabled").default(false),
    manualPaymentInstructions: text("manual_payment_instructions"),
    // Flexible shipping pricing (see src/lib/shipping-pricing.ts):
    //  shipping_mode      -> 'disabled' | 'flat' | 'zones'
    //  shipping_flat_rate -> fixed rate, or the base rate zone exceptions
    //                        override in 'zones' mode
    shippingMode: text("shipping_mode").notNull().default("disabled"),
    shippingFlatRate: numeric("shipping_flat_rate", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    // Store Verification (توثيق المتجر): official badge state. `verificationCode`
    // is issued by an admin; the merchant redeems it in the dashboard.
    isVerified: boolean("is_verified").notNull().default(false),
    verificationType: text("verification_type"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verificationCode: text("verification_code"),
    // Synthetic followers granted on verification approval — added to the
    // real store_followers count wherever a store's follower total is shown.
    followerBoost: integer("follower_boost").notNull().default(0),
    // Pay-per-use balances + paid add-ons (Add-ons, Credits & Paywall system)
    aiCredits: integer("ai_credits").notNull().default(50),
    whatsappCredits: integer("whatsapp_credits").notNull().default(0),
    hasWhiteLabel: boolean("has_white_label").notNull().default(false),
    maxStaffSeats: integer("max_staff_seats").notNull().default(1),
    // Strict expiration engine — when each entitlement lapses.
    planExpiresAt: timestamp("plan_expires_at", { withTimezone: true }),
    aiCreditsExpiresAt: timestamp("ai_credits_expires_at", { withTimezone: true }).default(
      sql`(now() + interval '30 days')`
    ),
    waCreditsExpiresAt: timestamp("wa_credits_expires_at", { withTimezone: true }).default(
      sql`(now() + interval '30 days')`
    ),
    themeConfig: jsonb("theme_config").$type<{
      themeId: 'modern' | 'minimal' | 'luxury';
      primaryColor: string;
      secondaryColor: string;
      backgroundColor: string;
      textColor: string;
      fontFamily: 'Inter' | 'Cairo' | 'Playfair Display' | 'Roboto';
      borderRadius: 'none' | 'sm' | 'md' | 'lg' | 'full';
      heroStyle: 'banner' | 'centered' | 'split';
      showAnnouncementBar: boolean;
      announcementText?: string;
    }>().default({
      themeId: 'modern',
      primaryColor: '#4f46e5',
      secondaryColor: '#06b6d4',
      backgroundColor: '#ffffff',
      textColor: '#0f172a',
      fontFamily: 'Cairo',
      borderRadius: 'md',
      heroStyle: 'banner',
      showAnnouncementBar: false
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("stores_owner_id_idx").on(table.ownerId)]
);

// ============================================
// ACTIVATION CODES (single-use payment vouchers)
// ============================================
// Redeemed through POST /api/billing/redeem-code. `type` is one of
// ACTIVATION_CODE_TYPES (see src/lib/billing-packages.ts):
//   PLAN_PRO / PLAN_ENTERPRISE            -> extends stores.plan_expires_at
//   AI_CREDITS_500 / _2000                -> ai_credits + ai_credits_expires_at
//   WA_CREDITS_500  / _2000               -> whatsapp_credits + wa_credits_expires_at
export const activationCodes = pgTable(
  "activation_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").unique().notNull(),
    type: text("type").notNull(),
    creditAmount: integer("credit_amount"),
    planDays: integer("plan_days").notNull().default(30),
    isUsed: boolean("is_used").notNull().default(false),
    usedByStoreId: uuid("used_by_store_id").references(() => stores.id, {
      onDelete: "set null",
    }),
    usedAt: timestamp("used_at", { withTimezone: true }),
    // Expiry of the *unredeemed* code itself.
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("activation_codes_type_idx").on(table.type),
    index("activation_codes_is_used_idx").on(table.isUsed),
  ]
);

// ============================================
// CATEGORIES
// ============================================
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("categories_store_id_idx").on(table.storeId)]
);

// ============================================
// PRODUCTS
// ============================================
export interface ProductSpecification {
  label: string;
  value: string;
}

export const PRODUCT_AVAILABILITIES = [
  "IN_STOCK",
  "OUT_OF_STOCK",
  "COMING_SOON",
] as const;

export type ProductAvailability = (typeof PRODUCT_AVAILABILITIES)[number];

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    description: text("description").default(""),
    price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
    stock: integer("stock").notNull().default(0),
    imageUrl: text("image_url").default(""),
    sku: text("sku").notNull().default(""),
    compareAtPrice: numeric("compare_at_price", { precision: 10, scale: 2 }),
    salePrice: numeric("sale_price", { precision: 10, scale: 2 }),
    discountPercent: integer("discount_percent"),
    availability: text("availability")
      .notNull()
      .default("IN_STOCK")
      .$type<ProductAvailability>(),
    imageGallery: jsonb("image_gallery")
      .$type<string[]>()
      .notNull()
      .default([]),
    specifications: jsonb("specifications")
      .$type<ProductSpecification[]>()
      .notNull()
      .default([]),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    isVisible: boolean("is_visible").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("products_store_id_idx").on(table.storeId),
    index("products_store_sku_idx").on(table.storeId, table.sku),
  ]
);

// ============================================
// SHIPPING ZONES (per-region delivery rates)
// ============================================
export const shippingZones = pgTable(
  "shipping_zones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    zoneName: text("zone_name").notNull(),
    rate: numeric("rate", { precision: 10, scale: 2 }).notNull().default("0"),
    estimatedDeliveryDays: integer("estimated_delivery_days")
      .notNull()
      .default(2),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("shipping_zones_store_id_idx").on(table.storeId)]
);

// ============================================
// SHIPPING INTEGRATIONS (multi-carrier routing)
// ============================================
// One row per carrier account a store connects. `carrier` holds one of
// SHIPPING_CARRIERS (see src/lib/shipping.ts); credentials are stored
// AES-256-GCM encrypted by src/lib/shipping-crypto.ts and never returned
// verbatim by the API. `default_for_governorates` routes deliveries whose
// destination matches one of the listed governorates to this account.
export const shippingIntegrations = pgTable(
  "shipping_integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    carrier: text("carrier").notNull(),
    apiKey: text("api_key").default(""),
    apiSecret: text("api_secret").default(""),
    isActive: boolean("is_active").notNull().default(true),
    defaultForGovernorates: text("default_for_governorates")
      .array()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("shipping_integrations_store_id_idx").on(table.storeId),
    index("shipping_integrations_store_carrier_idx").on(
      table.storeId,
      table.carrier
    ),
  ]
);

// ============================================
// ORDERS
// ============================================
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").default(""),
    customerAddress: text("customer_address").default(""),
    notes: text("notes").default(""),
    totalAmount: numeric("total_amount", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    // Coupon redemption tracking (Promotions & Flash Sales engine)
    couponCode: text("coupon_code"),
    discountAmount: numeric("discount_amount", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    // Delivery fee charged on top of the discounted merchandise total,
    // resolved from the store's shipping_mode / zones at checkout.
    shippingFee: numeric("shipping_fee", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    // Canonical uppercase status — see src/lib/order-state-machine.ts and
    // migration 0019_normalize_order_status.sql for the legacy spellings.
    status: text("status").notNull().default("PENDING"),
    // Smart POS & Cashier Sales Engine: where the sale happened + payment capture
    channel: text("channel").notNull().default("online"),
    paymentStatus: text("payment_status").notNull().default("unpaid"),
    paymentMethod: text("payment_method"),
    // Manual e-transfer proof (Vodafone Cash / InstaPay screenshot review).
    // `paymentProofUrl` stores either a compressed data URL or a public asset
    // URL; `paymentProofStatus` is NONE | PENDING | APPROVED | REJECTED.
    paymentProofUrl: text("payment_proof_url").default(""),
    paymentProofStatus: text("payment_proof_status").notNull().default("NONE"),
    paymentProofSubmittedAt: timestamp("payment_proof_submitted_at", {
      withTimezone: true,
    }),
    // Which wallet/channel the buyer says they paid through (free text).
    paymentMethodDetail: text("payment_method_detail").default(""),
    // Smart COD Verification & Anti-Return Fraud Shield Engine.
    // Non-COD orders stay at the column default `NOT_REQUIRED`; COD orders are
    // inserted explicitly as `PENDING_VERIFICATION` (see 0015_cod_verification.sql).
    codVerificationStatus: text("cod_verification_status")
      .notNull()
      .default("NOT_REQUIRED"),
    riskScore: text("risk_score").notNull().default("LOW"),
    riskReasons: text("risk_reasons").array().notNull().default([]),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    // Last WhatsApp verification dispatch — drives the EXPIRED timeout.
    verificationSentAt: timestamp("verification_sent_at", { withTimezone: true }),
    // Smart Shipping & Thermal Label Studio fulfillment fields
    shippingZoneId: uuid("shipping_zone_id").references(
      () => shippingZones.id,
      { onDelete: "set null" }
    ),
    trackingNumber: text("tracking_number"),
    courierName: text("courier_name"),
    labelPrintedAt: timestamp("label_printed_at", { withTimezone: true }),
    // Multi-carrier routing engine fields (see src/lib/shipping.ts):
    //  carrier_name       -> SHIPPING_CARRIERS entry that routed the shipment
    //  airway_bill_url    -> printable AWB PDF served by /api/shipping/awb/[orderId]
    //  shipping_status    -> UNFULFILLED | LABEL_CREATED | PICKED_UP |
    //                        OUT_FOR_DELIVERY | DELIVERED | RETURNED
    carrierName: text("carrier_name"),
    airwayBillUrl: text("airway_bill_url"),
    shippingStatus: text("shipping_status").notNull().default("UNFULFILLED"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("orders_store_id_idx").on(table.storeId),
    index("orders_shipping_zone_id_idx").on(table.shippingZoneId),
    index("orders_tracking_number_idx").on(table.trackingNumber),
  ]
);

// ============================================
// ORDER ITEMS
// ============================================
export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
});

// ============================================
// PROMOTIONS (timed flash sales)
// ============================================
export const promotions = pgTable(
  "promotions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    discountPercentage: integer("discount_percentage").notNull().default(0),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    bannerText: text("banner_text").default(""),
    // Live countdown banner toggle on the storefront
    showBanner: boolean("show_banner").notNull().default(true),
    // Empty arrays = the whole catalog; otherwise specific products/categories
    targetProductIds: jsonb("target_product_ids").$type<string[]>().default([]),
    targetCategoryIds: jsonb("target_category_ids").$type<string[]>().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("promotions_store_id_idx").on(table.storeId)]
);

// ============================================
// COUPONS
// ============================================
export const coupons = pgTable(
  "coupons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    discountAmount: numeric("discount_amount", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    minSpend: numeric("min_spend", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    maxUses: integer("max_uses").notNull().default(1),
    timesUsed: integer("times_used").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("coupons_store_id_idx").on(table.storeId),
    uniqueIndex("coupons_store_code_unique").on(table.storeId, table.code),
  ]
);

// ============================================
// ABANDONED CARTS (WhatsApp recovery engine)
// ============================================
export interface AbandonedCartItem {
  productId: string;
  name: string;
  price: string;
  quantity: number;
  imageUrl: string;
}

export const abandonedCarts = pgTable(
  "abandoned_carts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    customerName: text("customer_name").default(""),
    customerPhone: text("customer_phone").default(""),
    customerEmail: text("customer_email").default(""),
    // Guest cart snapshot as it was when the shopper left checkout
    cartItems: jsonb("cart_items").$type<AbandonedCartItem[]>().default([]),
    totalAmount: numeric("total_amount", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    // pending | recovered | expired | dismissed
    status: text("status").notNull().default("pending"),
    // Deep-link token embedded in the WhatsApp checkout link
    recoveryToken: text("recovery_token")
      .notNull()
      .default(sql`gen_random_uuid()::text`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("abandoned_carts_store_id_idx").on(table.storeId),
    index("abandoned_carts_status_idx").on(table.status),
    uniqueIndex("abandoned_carts_store_token_unique").on(
      table.storeId,
      table.recoveryToken
    ),
  ]
);

// ============================================
// LOYALTY SETTINGS (Smart Customer Loyalty engine)
// ============================================
export const loyaltySettings = pgTable(
  "loyalty_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    // Currency spent to earn one point (10 => 1 point per 10 EGP).
    pointsPerAmount: numeric("points_per_amount", { precision: 10, scale: 2 })
      .notNull()
      .default("10"),
    // Points required for one unit of discount (10 => 100 points = 10 EGP).
    redemptionRate: numeric("redemption_rate", { precision: 10, scale: 2 })
      .notNull()
      .default("10"),
    signupBonusPoints: integer("signup_bonus_points").notNull().default(0),
    isEnabled: boolean("is_enabled").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("loyalty_settings_store_id_idx").on(table.storeId),
    uniqueIndex("loyalty_settings_store_unique").on(table.storeId),
  ]
);

// ============================================
// VIP TIERS (Bronze / Silver / Gold / VIP spend thresholds)
// ============================================
export const vipTiers = pgTable(
  "vip_tiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    tierName: text("tier_name").notNull(),
    minSpendThreshold: numeric("min_spend_threshold", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    discountPercentage: numeric("discount_percentage", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    freeShippingUnlocked: boolean("free_shipping_unlocked").notNull().default(false),
    badgeColor: text("badge_color").notNull().default("#6366F1"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("vip_tiers_store_id_idx").on(table.storeId),
    index("vip_tiers_store_spend_idx").on(table.storeId, table.minSpendThreshold),
  ]
);

// ============================================
// CUSTOMERS (loyalty members, keyed by store + phone)
// ============================================
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    name: text("name").default(""),
    phone: text("phone").notNull().default(""),
    email: text("email").default(""),
    loyaltyPoints: integer("loyalty_points").notNull().default(0),
    totalLifetimeSpend: numeric("total_lifetime_spend", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    currentVipTierId: uuid("current_vip_tier_id").references(
      () => vipTiers.id,
      { onDelete: "set null" }
    ),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("customers_store_id_idx").on(table.storeId),
    uniqueIndex("customers_store_phone_unique").on(table.storeId, table.phone),
  ]
);

// ============================================
// LOYALTY TRANSACTIONS (points ledger)
// ============================================
export const loyaltyTransactions = pgTable(
  "loyalty_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    // Positive = earned/bonus, negative = redeemed/adjusted away.
    points: integer("points").notNull(),
    // earn | redeem | signup_bonus | adjustment
    type: text("type").notNull().default("earn"),
    balanceAfter: integer("balance_after").notNull().default(0),
    orderId: uuid("order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    description: text("description").default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("loyalty_transactions_store_id_idx").on(table.storeId),
    index("loyalty_transactions_customer_id_idx").on(table.customerId),
    index("loyalty_transactions_order_id_idx").on(table.orderId),
  ]
);

// ============================================
// PRICE ALERTS / WISHLIST DROPS
// ============================================
// Guest-facing drop notifications: a shopper can ask to be notified (by phone
// or email) if the price of a specific product falls below the price they saw.
// One row per product + contact + current notified baseline price. `status` is
// pending | notified | dismissed. Store owners can review these under the store
// they own (not part of this task's public API scope).
export const priceAlerts = pgTable(
  "price_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    // Normalized contact: either an E.164 phone or a lowercase email.
    contactType: text("contact_type").notNull(),
    contactValue: text("contact_value").notNull(),
    // The price (as string, same format as products.price) the shopper saw
    // when they requested the alert. Notifications are sent when the live price
    // drops below this baseline.
    baselinePrice: text("baseline_price").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("price_alerts_store_id_idx").on(table.storeId),
    index("price_alerts_product_id_idx").on(table.productId),
    uniqueIndex("price_alerts_contact_product_unique").on(
      table.storeId,
      table.productId,
      table.contactType,
      table.contactValue
    ),
  ]
);

// ============================================
// STORE REVIEWS (shopper -> merchant ratings)
// ============================================
export const storeReviews = pgTable(
  "store_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    customerName: text("customer_name").notNull().default(""),
    // 1-5 stars; enforced by the API and a DB CHECK constraint.
    rating: integer("rating").notNull().default(5),
    comment: text("comment").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("store_reviews_store_id_idx").on(table.storeId),
    index("store_reviews_created_at_idx").on(table.createdAt),
  ]
);

// ============================================
// STORE FOLLOWERS (shopper -> merchant follows)
// ============================================
// `userId` holds either an app `users.id` (uuid text) for signed-in users or an
// anonymous visitor id generated client-side — hence TEXT, not UUID.
export const storeFollowers = pgTable(
  "store_followers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("store_followers_store_id_idx").on(table.storeId),
    index("store_followers_created_at_idx").on(table.createdAt),
    uniqueIndex("store_followers_store_user_unique").on(
      table.storeId,
      table.userId
    ),
  ]
);

// ============================================
// STORE VERIFICATION REQUESTS (توثيق المتجر)
// ============================================
// `type` is 'free' (10k followers milestone) or 'paid' (700 EGP Vodafone Cash).
// `status` is pending | approved | rejected. `paymentProof` stores a compressed
// data:image/...;base64,... screenshot; `paymentReference` is the Vodafone Cash
// transaction reference / sender number the merchant reports.
export const storeVerificationRequests = pgTable(
  "store_verification_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: text("status").notNull().default("pending"),
    paymentReference: text("payment_reference").notNull().default(""),
    paymentProof: text("payment_proof").notNull().default(""),
    adminNote: text("admin_note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => [
    index("store_verification_requests_store_id_idx").on(table.storeId),
    index("store_verification_requests_status_idx").on(table.status),
    index("store_verification_requests_created_at_idx").on(table.createdAt),
  ]
);

// ============================================
// WAREHOUSES & BRANCHES (multi-warehouse stock engine)
// ============================================
export const warehouses = pgTable(
  "warehouses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code").notNull(),
    city: text("city").default(""),
    address: text("address").default(""),
    // The fallback fulfilment location for orders whose city has no branch.
    isMainWarehouse: boolean("is_main_warehouse").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("warehouses_store_id_idx").on(table.storeId),
    uniqueIndex("warehouses_store_code_unique").on(table.storeId, table.code),
  ]
);

// Per-location inventory for a product (junction: warehouse x product).
export const warehouseStock = pgTable(
  "warehouse_stock",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(0),
    // Units held back for pending transfers / reserved orders.
    reservedQuantity: integer("reserved_quantity").notNull().default(0),
  },
  (table) => [
    index("warehouse_stock_warehouse_id_idx").on(table.warehouseId),
    index("warehouse_stock_product_id_idx").on(table.productId),
    uniqueIndex("warehouse_stock_location_unique").on(
      table.warehouseId,
      table.productId
    ),
  ]
);

// Inter-warehouse stock movements: pending -> in_transit -> completed.
export const stockTransfers = pgTable(
  "stock_transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    fromWarehouseId: uuid("from_warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "cascade" }),
    toWarehouseId: uuid("to_warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    // pending | in_transit | completed
    status: text("status").notNull().default("pending"),
    notes: text("notes").default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("stock_transfers_store_id_idx").on(table.storeId),
    index("stock_transfers_status_idx").on(table.status),
    index("stock_transfers_from_warehouse_idx").on(table.fromWarehouseId),
    index("stock_transfers_to_warehouse_idx").on(table.toWarehouseId),
  ]
);

// ============================================
// STORE ADD-ONS (monthly paid power-ups)
// ============================================
// `add_on_code` is one of the codes declared in src/lib/paywall.ts:
//   white_label  -> hides the "Powered by StoreHub" credit (99 EGP/month)
//   staff_seats  -> extra admin users beyond the included seat (50 EGP/seat/month)
export const storeAddOns = pgTable(
  "store_add_ons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    addOnCode: text("add_on_code").notNull(),
    // Units purchased (seats); always 1 for boolean add-ons such as white_label.
    quantity: integer("quantity").notNull().default(1),
    // Monthly price per unit in EGP, snapshotted for receipts/auditing.
    monthlyPrice: numeric("monthly_price", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    isActive: boolean("is_active").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("store_add_ons_store_id_idx").on(table.storeId),
    uniqueIndex("store_add_ons_store_code_unique").on(
      table.storeId,
      table.addOnCode
    ),
  ]
);

// ============================================
// ORDER STATUS LOGS (audit trail for order status transitions)
// ============================================
export const orderStatusLogs = pgTable(
  "order_status_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    previousStatus: text("previous_status").notNull(),
    newStatus: text("new_status").notNull(),
    changedByUserId: uuid("changed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("order_status_logs_order_id_idx").on(table.orderId),
    index("order_status_logs_store_id_idx").on(table.storeId),
    index("order_status_logs_created_at_idx").on(table.createdAt),
  ]
);

// ============================================
// STORE CREDITS (pay-per-use top-up ledger)
// ============================================
// Balance lives on stores.ai_credits / stores.whatsapp_credits; this table is
// the append-only audit trail of every purchase and every deduction.
export const storeCredits = pgTable(
  "store_credits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    // ai | whatsapp
    creditType: text("credit_type").notNull(),
    // Positive = top-up / bonus, negative = usage.
    amount: integer("amount").notNull(),
    balanceAfter: integer("balance_after").notNull().default(0),
    description: text("description").default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("store_credits_store_id_idx").on(table.storeId),
    index("store_credits_store_type_idx").on(table.storeId, table.creditType),
  ]
);

// ============================================
// SOCIAL CHANNELS (AI social selling engine)
// ============================================
// One row per connected messaging surface (Facebook Page / Instagram
// professional account / WhatsApp Business). `access_token` and `page_id` are
// stored AES-256-GCM encrypted (src/lib/social-crypto.ts); `page_key` keeps a
// SHA-256 of the plaintext page id so the webhook can resolve an incoming
// payload to a store without decrypting every row.
// See supabase/migrations/0018_ai_social_selling.sql.
export const SOCIAL_PLATFORMS = ["FACEBOOK", "INSTAGRAM", "WHATSAPP"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export function isSocialPlatform(value: unknown): value is SocialPlatform {
  return (
    typeof value === "string" &&
    (SOCIAL_PLATFORMS as readonly string[]).includes(value)
  );
}

export const socialChannels = pgTable(
  "social_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    // FACEBOOK | INSTAGRAM | WHATSAPP
    platform: text("platform").notNull(),
    accessToken: text("access_token").default(""),
    pageId: text("page_id").default(""),
    // sha256(plaintext page id) — webhook lookup index, never exposed.
    pageKey: text("page_key").default(""),
    isConnected: boolean("is_connected").notNull().default(false),
    isAutoReplyEnabled: boolean("is_auto_reply_enabled")
      .notNull()
      .default(true),
    // Custom instructions for the store's AI bot (tone, dialect, policies).
    aiPersonaPrompt: text("ai_persona_prompt").default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("social_channels_store_id_idx").on(table.storeId),
    index("social_channels_page_key_idx").on(table.pageKey),
    uniqueIndex("social_channels_store_platform_unique").on(
      table.storeId,
      table.platform
    ),
  ]
);

// ============================================
// AI CHAT SESSIONS (conversational checkout threads)
// ============================================
// One row per customer thread on a social platform. `conversation_history`
// is an ordered JSONB array of chat messages; `extracted_order_data` carries
// the name / phone / address / items the assistant parsed out of the chat and
// is turned into a real order by `createDraftOrder` (see
// src/lib/ai/social-sales-bot.ts).
export const AI_CHAT_SESSION_STATUSES = [
  "ACTIVE",
  "ORDER_CREATED",
  "HANDED_TO_HUMAN",
] as const;
export type AiChatSessionStatus = (typeof AI_CHAT_SESSION_STATUSES)[number];

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
  at?: string;
}

export interface ExtractedOrderData {
  items: {
    productId?: string;
    name: string;
    size?: string;
    color?: string;
    quantity: number;
    unitPrice?: number;
  }[];
  address: string;
  phone: string;
  name: string;
  governorate?: string;
}

export const aiChatSessions = pgTable(
  "ai_chat_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    // Messenger PSID, Instagram scoped id, or E.164 phone number.
    customerPhoneOrPsid: text("customer_phone_or_psid").notNull(),
    customerName: text("customer_name").default(""),
    platform: text("platform").notNull(),
    conversationHistory: jsonb("conversation_history")
      .$type<AiChatMessage[]>()
      .notNull()
      .default([]),
    extractedOrderData: jsonb("extracted_order_data")
      .$type<ExtractedOrderData>()
      .notNull()
      .default({ items: [], address: "", phone: "", name: "" }),
    // ACTIVE | ORDER_CREATED | HANDED_TO_HUMAN
    status: text("status").notNull().default("ACTIVE"),
    orderId: uuid("order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("ai_chat_sessions_store_id_idx").on(table.storeId),
    index("ai_chat_sessions_status_idx").on(table.status),
    uniqueIndex("ai_chat_sessions_thread_unique").on(
      table.storeId,
      table.platform,
      table.customerPhoneOrPsid
    ),
  ]
);

// ============================================
// ACTIVATION CODE PRICING & PROMOS (BILLING PACKAGES)
// ============================================
// Dynamic pricing for each activation code type (plan/credit vouchers).
// Super Admins can edit base price, promo price, and promo expiration.
// This table serves as the "billing_packages" table per requirements.
export const activationCodePricing = pgTable(
  "activation_code_pricing",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Matches ACTIVATION_CODE_TYPES from billing-packages.ts
    type: text("type").notNull().unique(),
    // Display names (Arabic & English)
    nameAr: text("name_ar"),
    nameEn: text("name_en"),
    // Base price in EGP (what merchants pay normally)
    basePrice: numeric("base_price", { precision: 10, scale: 2 }).notNull().default("0"),
    // Optional promotional price in EGP
    promoPrice: numeric("promo_price", { precision: 10, scale: 2 }),
    // When the promotional price expires (ISO timestamp)
    promoExpiresAt: timestamp("promo_expires_at", { withTimezone: true }),
    // Whether this package is active/visible
    isActive: boolean("is_active").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("activation_code_pricing_type_idx").on(table.type),
    index("activation_code_pricing_is_active_idx").on(table.isActive),
  ]
);

// ============================================
// NOTIFICATIONS (merchant -> customer, admin -> merchant)
// ============================================
// See supabase/migrations/0021_notifications.sql for the authoritative DDL
// (CHECK constraints + RLS). Two scopes share this table:
//   MERCHANT_TO_CUSTOMER -> store-scoped WhatsApp campaigns
//   ADMIN_TO_MERCHANT    -> platform-wide in-app announcements
export const NOTIFICATION_SCOPES = [
  "MERCHANT_TO_CUSTOMER",
  "ADMIN_TO_MERCHANT",
] as const;
export type NotificationScope = (typeof NOTIFICATION_SCOPES)[number];

export const NOTIFICATION_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "QUEUED",
  "SENDING",
  "SENT",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const NOTIFICATION_CATEGORIES = [
  "GENERAL",
  "ANNOUNCEMENT",
  "PROMOTION",
  "ORDER_UPDATE",
  "SYSTEM",
] as const;
export type NotificationCategory =
  (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_PRIORITIES = [
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
] as const;
export type NotificationPriority =
  (typeof NOTIFICATION_PRIORITIES)[number];

export const NOTIFICATION_CHANNELS = ["IN_APP", "WHATSAPP"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_AUDIENCE_TYPES = [
  "ALL_CUSTOMERS",
  "SELECTED_CUSTOMERS",
  "CUSTOMER_SEGMENT",
  "ALL_MERCHANTS",
  "SELECTED_MERCHANTS",
  "MERCHANT_PLAN",
] as const;
export type NotificationAudienceType =
  (typeof NOTIFICATION_AUDIENCE_TYPES)[number];

export const RECIPIENT_STATUSES = [
  "PENDING",
  "SENT",
  "DELIVERED",
  "FAILED",
  "SKIPPED",
  "READ",
] as const;
export type RecipientStatus = (typeof RECIPIENT_STATUSES)[number];

export interface NotificationAudienceFilter {
  customerIds?: string[];
  merchantIds?: string[];
  minSpend?: number;
  vipTierId?: string;
  lastOrderDays?: number;
  loyaltyPoints?: number;
  plan?: "free" | "pro";
}

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: text("scope").notNull(),
    storeId: uuid("store_id").references(() => stores.id, {
      onDelete: "cascade",
    }),
    senderType: text("sender_type").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    category: text("category").notNull().default("GENERAL"),
    priority: text("priority").notNull().default("NORMAL"),
    channel: text("channel").notNull(),
    status: text("status").notNull().default("DRAFT"),
    audienceType: text("audience_type").notNull(),
    audienceFilter: jsonb("audience_filter")
      .$type<NotificationAudienceFilter>()
      .notNull()
      .default({}),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    recipientCount: integer("recipient_count").notNull().default(0),
    deliveredCount: integer("delivered_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    readCount: integer("read_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("notifications_store_created_idx").on(
      table.storeId,
      table.createdAt
    ),
    index("notifications_scope_created_idx").on(
      table.scope,
      table.createdAt
    ),
    index("notifications_status_idx").on(table.status),
    index("notifications_scheduled_at_idx").on(table.scheduledAt),
  ]
);

export const notificationRecipients = pgTable(
  "notification_recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    // Stable key: 'customer:<uuid>' or 'user:<uuid>'.
    recipientKey: text("recipient_key").notNull(),
    recipientType: text("recipient_type").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    storeId: uuid("store_id").references(() => stores.id, {
      onDelete: "cascade",
    }),
    recipientName: text("recipient_name").notNull().default(""),
    recipientPhone: text("recipient_phone").notNull().default(""),
    recipientEmail: text("recipient_email").notNull().default(""),
    channel: text("channel").notNull().default("IN_APP"),
    status: text("status").notNull().default("PENDING"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("notification_recipients_notification_key_unique").on(
      table.notificationId,
      table.recipientKey
    ),
    index("notification_recipients_notification_status_idx").on(
      table.notificationId,
      table.status
    ),
    index("notification_recipients_user_read_idx").on(
      table.userId,
      table.readAt
    ),
    index("notification_recipients_store_created_idx").on(
      table.storeId,
      table.createdAt
    ),
    index("notification_recipients_customer_idx").on(table.customerId),
  ]
);

export const notificationEvents = pgTable(
  "notification_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    actorType: text("actor_type").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    event: text("event").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("notification_events_notification_created_idx").on(
      table.notificationId,
      table.createdAt
    ),
  ]
);

// ============================================
// TEAM MANAGEMENT (store members + invitations)
// ============================================
// `stores.owner_id` is the single OWNER. Extra staff are rows here with
// role = 'ADMIN'. Invitations are single-use tokens redeemed through
// POST /api/team/accept (see src/app/accept-invite/page.tsx).
export const STORE_MEMBER_ROLES = ["ADMIN"] as const;
export const storeMembers = pgTable(
  "store_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("ADMIN"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("store_members_store_user_unique").on(
      table.storeId,
      table.userId
    ),
    index("store_members_user_idx").on(table.userId),
    index("store_members_store_idx").on(table.storeId),
  ]
);

export const INVITATION_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "REVOKED",
  "EXPIRED",
] as const;

export const storeInvitations = pgTable(
  "store_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("ADMIN"),
    token: text("token").unique().notNull(),
    status: text("status").notNull().default("PENDING"),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("store_invitations_store_idx").on(table.storeId, table.status),
    index("store_invitations_email_idx").on(table.email),
  ]
);

// ============================================
// ANALYTICS EVENTS (platform traffic & conversions)
// ============================================
// Lightweight first-party analytics. `visitor_id` is a random browser-generated
// UUID stored in localStorage — never an IP address or other PII. PAGE_VIEW rows
// come from /api/analytics/track; SIGNUP / ORDER_CREATED are written by the
// auth and checkout APIs so conversion rate can be measured per visitor.
export const ANALYTICS_EVENT_TYPES = [
  "PAGE_VIEW",
  "SIGNUP",
  "ORDER_CREATED",
] as const;
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventType: text("event_type").notNull(),
    visitorId: text("visitor_id").notNull(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    storeId: uuid("store_id").references(() => stores.id, {
      onDelete: "set null",
    }),
    orderId: uuid("order_id").references(() => orders.id, {
      onDelete: "cascade",
    }),
    path: text("path").notNull().default(""),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("analytics_events_type_created_idx").on(table.eventType, table.createdAt),
    index("analytics_events_created_at_idx").on(table.createdAt),
    index("analytics_events_visitor_created_idx").on(table.visitorId, table.createdAt),
    index("analytics_events_store_created_idx").on(table.storeId, table.createdAt),
    index("analytics_events_order_id_idx").on(table.orderId),
  ]
);

// ============================================
// PLATFORM BROADCASTS (global site banner)
// ============================================
// Admin-controlled announcement shown at the top of the platform for every
// visitor. The public banner endpoint only serves rows where is_active = true
// and expires_at is still in the future.
export const platformBroadcasts = pgTable(
  "platform_broadcasts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    message: text("message").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("platform_broadcasts_active_idx").on(table.isActive, table.expiresAt),
  ]
);

// ============================================
// PLATFORM FEED (super-admin announcements)
// ============================================
// Posts published by the platform owner (ADMIN_EMAIL session) rendered as a
// verified "StoreHub" feed that merchants and shoppers can follow.
export const PLATFORM_POST_CATEGORIES = [
  "UPDATE",
  "ANNOUNCEMENT",
  "FEATURE",
] as const;
export type PlatformPostCategory =
  (typeof PLATFORM_POST_CATEGORIES)[number];

export const platformPosts = pgTable(
  "platform_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorName: text("author_name").notNull().default("StoreHub"),
    content: text("content").notNull(),
    category: text("category").notNull().default("UPDATE"),
    linkUrl: text("link_url").notNull().default(""),
    isPublished: boolean("is_published").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("platform_posts_published_idx").on(
      table.isPublished,
      table.createdAt
    ),
  ]
);

// ============================================
// PLATFORM FOLLOWS (follow the StoreHub feed)
// ============================================
// follower_id is the app user id for signed-in users, or a client-generated
// anonymous UUID persisted in localStorage — same convention as
// store_followers. The platform feed is a singleton, so no store_id column.
export const platformFollows = pgTable(
  "platform_follows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    followerId: text("follower_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("platform_follows_follower_unique").on(table.followerId),
    index("platform_follows_created_at_idx").on(table.createdAt),
  ]
);
