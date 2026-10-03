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
    isVisible: boolean("is_visible").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("products_store_id_idx").on(table.storeId)]
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
    status: text("status").notNull().default("Pending"),
    // Smart POS & Cashier Sales Engine: where the sale happened + payment capture
    channel: text("channel").notNull().default("online"),
    paymentStatus: text("payment_status").notNull().default("unpaid"),
    paymentMethod: text("payment_method"),
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
