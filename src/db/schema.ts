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
// ACTIVATION CODES
// ============================================
export const activationCodes = pgTable("activation_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").unique().notNull(),
  plan: text("plan").notNull().default("pro"),
  price: numeric("price", { precision: 10, scale: 2 }),
  discount: integer("discount").default(0),
  maxUses: integer("max_uses").notNull().default(1),
  timesUsed: integer("times_used").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
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
    // Smart Shipping & Thermal Label Studio fulfillment fields
    shippingZoneId: uuid("shipping_zone_id").references(
      () => shippingZones.id,
      { onDelete: "set null" }
    ),
    trackingNumber: text("tracking_number"),
    courierName: text("courier_name"),
    labelPrintedAt: timestamp("label_printed_at", { withTimezone: true }),
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
