"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Locale = "en" | "ar";

export const LOCALE_STORAGE_KEY = "storehub_locale";

const en = {
  // --------------------------------------------
  // Common
  // --------------------------------------------
  "common.save": "Save",
  "common.saving": "Saving...",
  "common.cancel": "Cancel",
  "common.create": "Create",
  "common.update": "Update",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.close": "Close",
  "common.search": "Search",
  "common.language": "Language",
  "common.mute": "Mute order alerts",
  "common.unmute": "Unmute order alerts",
  "common.optional": "Optional",

  // --------------------------------------------
  // Navigation
  // --------------------------------------------
  "nav.dashboard": "Dashboard",
  "nav.products": "Products",
  "nav.categories": "Categories",
  "nav.orders": "Orders",
  "nav.customers": "Customers",
  "nav.analytics": "Analytics",
  "nav.billing": "Billing",
  "nav.settings": "Settings",
  "nav.signOut": "Sign Out",

  // Desktop notifications
  "notifications.enable": "Enable desktop order alerts",
  "notifications.enabled": "Desktop alerts on",
  "notifications.unsupported": "Desktop notifications are not supported in this browser",
  "notifications.blocked": "Notifications are blocked — allow them in your browser settings",

  // --------------------------------------------
  // Dashboard home
  // --------------------------------------------
  "home.todayOrders": "Today's Orders",
  "home.todaySales": "Today's Sales (EGP)",
  "home.totalProducts": "Total Products",
  "home.pendingOrders": "Pending Orders",
  "home.recentOrders": "Recent Orders",
  "home.noOrders":
    "No orders yet. Share your store link to start receiving orders!",

  // --------------------------------------------
  // Shared table headers
  // --------------------------------------------
  "table.customer": "Customer",
  "table.name": "Name",
  "table.phone": "Phone",
  "table.amount": "Amount",
  "table.status": "Status",
  "table.update": "Update",
  "table.date": "Date",
  "table.orders": "Orders",
  "table.totalSpent": "Total Spent",
  "table.lastOrder": "Last Order",

  // --------------------------------------------
  // Order statuses
  // --------------------------------------------
  "status.Pending": "Pending",
  "status.Confirmed": "Confirmed",
  "status.Preparing": "Preparing",
  "status.Ready": "Ready",
  "status.Completed": "Completed",
  "status.Cancelled": "Cancelled",

  // --------------------------------------------
  // Products
  // --------------------------------------------
  "products.searchPlaceholder": "Search products...",
  "products.add": "Add Product",
  "products.addTitle": "Add Product",
  "products.editTitle": "Edit Product",
  "products.emptyTitle": "No products yet",
  "products.emptySubtitle": "Add your first product to get started",
  "products.field.name": "Name *",
  "products.field.description": "Description",
  "products.field.price": "Price (EGP) *",
  "products.field.stock": "Stock",
  "products.field.image": "Product Image",
  "products.field.category": "Category",
  "products.noCategory": "No category",
  "products.visibleLabel": "Visible to customers",
  "products.inStock": "{count} in stock",
  "products.outOfStock": "Out of stock",
  "products.visible": "Visible",
  "products.hidden": "Hidden",
  "products.deleteConfirm": "Are you sure you want to delete this product?",
  "products.toast.created": "Product created successfully",
  "products.toast.updated": "Product updated successfully",
  "products.toast.deleted": "Product deleted",
  "products.toast.saveFailed": "Failed to save product",
  "products.toast.deleteFailed": "Failed to delete product",
  "products.toast.visibilityFailed": "Failed to update visibility",
  "products.toast.limitReached":
    "Free plan limit reached (15 products) — upgrade to Pro for unlimited products",
  "products.planUsage": "{used} / {limit} products on the Free plan",
  "products.upgrade": "Upgrade to Pro",

  // --------------------------------------------
  // AI assistant (shared)
  // --------------------------------------------
  "ai.generate": "Generate with AI",
  "ai.generating": "Generating...",
  "ai.regenerate": "Regenerate",
  "ai.failed": "AI generation failed, please try again",
  "ai.mockBadge": "Demo AI",
  "ai.copy": "Copy",
  "ai.copied": "Copied to clipboard",
  "ai.copyFailed": "Failed to copy",

  // Products AI description
  "products.ai.keywords": "Keywords / features",
  "products.ai.keywordsPlaceholder": "e.g. waterproof, lightweight, 1-year warranty",
  "products.ai.hint": "Describe the key features and AI will write the description",
  "products.ai.needName": "Add a product name before generating",
  "products.toast.aiGenerated": "Description generated successfully",

  // --------------------------------------------
  // Billing
  // --------------------------------------------
  "billing.title": "Billing & Plan",
  "billing.subtitle": "Track product usage and switch between subscription tiers",
  "billing.currentPlan": "Current plan",
  "billing.usageTitle": "Product usage",
  "billing.usageLabel": "{used} of {limit} products used",
  "billing.usageUnlimited": "{used} products · unlimited plan",
  "billing.remaining": "{count} slots left",
  "billing.limitReached": "Plan limit reached — upgrade to keep adding products",
  "billing.planFreeName": "Free",
  "billing.planFreePrice": "0 EGP / month",
  "billing.planFreeDesc": "Everything you need to start selling online",
  "billing.planFreeLimit": "Up to 15 products",
  "billing.planProName": "Pro",
  "billing.planProPrice": "299 EGP / month",
  "billing.planProDesc": "For growing stores with large catalogs",
  "billing.planProLimit": "Unlimited products",
  "billing.currentBadge": "Current plan",
  "billing.upgrade": "Upgrade to Pro",
  "billing.downgrade": "Downgrade to Free",
  "billing.popular": "Most popular",
  "billing.mockNote": "Demo billing — switching tiers is instant and no payment is taken.",
  "billing.feature.orderTracking": "Order tracking with realtime alerts",
  "billing.feature.analytics": "Revenue & sales analytics",
  "billing.feature.priority": "Priority support",
  "billing.toast.changed": "Plan updated to {plan}",
  "billing.toast.failed": "Failed to update plan",
  "billing.activation.failed": "Failed to activate code. Please try again.",
  "billing.upgradeModal.title": "Upgrade to Pro",
  "billing.upgradeModal.step1Title": "Step 1: Contact us on WhatsApp",
  "billing.upgradeModal.step1Desc": "Message us to complete your payment and receive your activation code.",
  "billing.upgradeModal.whatsappLink": "Open WhatsApp Chat",
  "billing.upgradeModal.step1AltTitle": "Or transfer via Vodafone Cash / InstaPay",
  "billing.upgradeModal.step1AltDesc": "Send {phone} the subscription amount, then you'll receive an activation code.",
  "billing.upgradeModal.activationCodeLabel": "Activation Code (كود التفعيل)",
  "billing.upgradeModal.activationCodePlaceholder": "Enter your activation code",
  "billing.upgradeModal.submitCode": "Submit Code",
  "billing.upgradeModal.successTitle": "Pro Plan Activated!",
  "billing.upgradeModal.successDesc": "Your store now has unlimited products. Welcome to Pro!",
  "billing.upgradeModal.close": "Continue to Dashboard",

  // --------------------------------------------
  // Analytics
  // --------------------------------------------
  "analytics.subtitle": "Revenue trends, best sellers and average order value",
  "analytics.totalRevenue": "Total Revenue (EGP)",
  "analytics.totalOrders": "Total Orders",
  "analytics.aov": "Average Order Value (EGP)",
  "analytics.avgDaily": "Avg Daily Revenue (EGP)",
  "analytics.revenueTrend": "Revenue Trend",
  "analytics.aovTrend": "Average Order Value Trend",
  "analytics.daily": "Daily",
  "analytics.weekly": "Weekly",
  "analytics.topProducts": "Top 5 Best-Selling Products",
  "analytics.topProductsEmpty": "No sales yet — best sellers appear after your first orders",
  "analytics.chartEmpty": "No revenue data in this period",
  "analytics.soldCount": "{count} sold",
  "analytics.ordersCount": "{count} orders",

  // AI business insights
  "analytics.insights.title": "AI Business Insights",
  "analytics.insights.subtitle":
    "3 actionable recommendations generated from your store analytics",
  "analytics.insights.generate": "Generate Insights",
  "analytics.insights.generating": "Analyzing your store...",
  "analytics.insights.pending": "Generate insights to see recommendations tailored to your numbers",
  "analytics.insights.failed": "Failed to generate insights, please try again",
  "analytics.insights.unavailable": "Load analytics first, then generate insights",

  // --------------------------------------------
  // Marketing (AI social posts)
  // --------------------------------------------
  "nav.marketing": "Marketing",
  "marketing.subtitle":
    "Generate copy-ready Arabic social posts for your products",
  "marketing.product": "Product",
  "marketing.selectProduct": "Select a product",
  "marketing.platform": "Platform",
  "marketing.platform.facebook": "Facebook",
  "marketing.platform.instagram": "Instagram",
  "marketing.platform.tiktok": "TikTok",
  "marketing.angle": "Promotion angle",
  "marketing.anglePlaceholder": "e.g. weekend discount, free delivery, new arrival",
  "marketing.generate": "Generate Post",
  "marketing.generating": "Generating post...",
  "marketing.output": "Generated Post",
  "marketing.outputPlaceholder": "Your generated post will appear here",
  "marketing.emptyTitle": "No products yet",
  "marketing.emptySubtitle": "Add products first so AI can write posts about them",
  "marketing.loadingProducts": "Loading your products...",
  "marketing.postFor": "Post for {product} · {platform}",
  "marketing.toast.generated": "Marketing post generated",
  "marketing.toast.failed": "Failed to generate post",

  // --------------------------------------------
  // Uploads
  // --------------------------------------------
  "upload.choose": "Upload image",
  "upload.inProgress": "Uploading...",
  "upload.pasteUrl": "…or paste an image URL",
  "upload.remove": "Remove image",
  "upload.invalidType":
    "Only image files are allowed (JPG, PNG, WebP, GIF, AVIF, SVG)",
  "upload.tooLarge": "File is too large (max 5 MB)",
  "upload.notConfigured":
    "Supabase Storage is not configured. Set SUPABASE_JWT_SECRET in your environment.",
  "upload.failed": "Upload failed, please try again",

  // --------------------------------------------
  // Categories
  // --------------------------------------------
  "categories.countOne": "1 category",
  "categories.countMany": "{count} categories",
  "categories.add": "Add Category",
  "categories.newTitle": "New Category",
  "categories.field.name": "Category Name *",
  "categories.placeholder": "e.g. Electronics",
  "categories.emptyTitle": "No categories yet",
  "categories.emptySubtitle": "Create categories to organize your products",
  "categories.createdOn": "Created {date}",
  "categories.deleteConfirm":
    "Are you sure? Products in this category will lose their category.",
  "categories.toast.created": "Category created successfully",
  "categories.toast.deleted": "Category deleted",
  "categories.toast.failed": "Failed to create category",

  // --------------------------------------------
  // Orders
  // --------------------------------------------
  "orders.filterAll": "All",
  "orders.emptyTitle": "No orders yet",
  "orders.emptySubtitle": "Orders will appear here when customers make purchases",
  "orders.toast.updated": "Order status updated",
  "orders.toast.failed": "Failed to update status",
  "orders.live": "Live",
  "orders.connecting": "Connecting…",
  "orders.polling": "Auto-refresh",
  "orders.newOrderTitle": "New order",
  "orders.newOrderToast": "New order from {name}",
  "orders.notes": "Notes",

  // --------------------------------------------
  // Customers
  // --------------------------------------------
  "customers.subtitle":
    "Customer metrics aggregated from your store's orders by phone number",
  "customers.searchPlaceholder": "Search by name or phone...",
  "customers.totalCustomers": "Total Customers",
  "customers.totalRevenue": "Total Revenue (EGP)",
  "customers.repeatCustomers": "Returning Customers",
  "customers.avgOrder": "Average Order (EGP)",
  "customers.emptyTitle": "No customers yet",
  "customers.emptySubtitle": "Customer insights appear after your first order",
  "customers.noPhone": "No phone",
  "customers.showing": "Showing {count} of {total} customers",

  // --------------------------------------------
  // Settings
  // --------------------------------------------
  "settings.title": "Store Settings",
  "settings.storeName": "Store Name",
  "settings.description": "Description",
  "settings.category": "Category",
  "settings.selectCategory": "Select a category",
  "settings.phone": "Phone",
  "settings.address": "Address",
  "settings.logo": "Logo",
  "settings.cover": "Cover Image",
  "settings.brandColor": "Brand Accent Color",
  "settings.brandColorHint": "Applied to buttons, prices and headers on your storefront",
  "settings.brandColorDefault": "Default",
  "settings.brandColorCustom": "Custom color",
  "settings.brandColorPreview": "Preview",
  "settings.toast.saved": "Store settings updated successfully",
  "settings.toast.failed": "Failed to update settings",
  "settings.toast.assetRemoved": "Image removed",

  // --------------------------------------------
  // Store categories (select options)
  // --------------------------------------------
  "category.Fashion": "Fashion",
  "category.Electronics": "Electronics",
  "category.Food & Drinks": "Food & Drinks",
  "category.Home & Garden": "Home & Garden",
  "category.Beauty": "Beauty",
  "category.Sports": "Sports",
  "category.Books": "Books",
  "category.Other": "Other",
  "category.retail": "Retail",
  "category.electronics": "Electronics",
  "category.fashion": "Fashion",
  "category.food": "Food & Drinks",
  "category.health": "Health",
  "category.home": "Home & Garden",
  "category.sports": "Sports",
  "category.beauty": "Beauty",
  "category.automotive": "Automotive",
  "category.books": "Books",
  "category.other": "Other",

  // --------------------------------------------
  // Storefront
  // --------------------------------------------
  "store.searchPlaceholder": "Search products...",
  "store.all": "All",
  "store.addToCart": "Add to Cart",
  "store.outOfStock": "Out of Stock",
  "store.left": "{count} left",
  "store.cartTitle": "Cart ({count})",
  "store.cartEmpty": "Your cart is empty",
  "store.total": "Total",
  "store.checkout": "Proceed to Checkout",
  "store.clearCart": "Clear Cart",
  "store.noProducts": "No products found",
  "store.language": "Language",
  "store.notFoundTitle": "Store Not Found",
  "store.notFoundSubtitle": "The store you're looking for doesn't exist.",
  "store.goHome": "Go Home",
  "store.poweredBy": "Powered by StoreHub",

  // Product detail page
  "product.backToStore": "Back to store",
  "product.description": "Description",
  "product.quantity": "Quantity",
  "product.addedToCart": "Added to cart",
  "product.notFoundTitle": "Product Not Found",
  "product.notFoundSubtitle":
    "This product doesn't exist or is no longer available.",

  // Errors & 404
  "error.title": "Something Went Wrong",
  "error.subtitle": "An unexpected error occurred. Please try again.",
  "error.retry": "Try Again",
  "notFound.title": "Page Not Found",
  "notFound.subtitle": "The page you're looking for doesn't exist.",

  // --------------------------------------------
  // Checkout
  // --------------------------------------------
  "checkout.customerDetails": "Customer Details",
  "checkout.orderSummary": "Order Summary",
  "checkout.name": "Name *",
  "checkout.namePlaceholder": "Your full name",
  "checkout.phone": "Phone",
  "checkout.phonePlaceholder": "+20 100 123 4567",
  "checkout.address": "Delivery Address",
  "checkout.addressPlaceholder": "Your delivery address",
  "checkout.notes": "Order Notes",
  "checkout.notesPlaceholder": "Any special instructions...",
  "checkout.placeOrder": "Place Order",
  "checkout.placingOrder": "Placing Order...",
  "checkout.itemsInCart": "Items in cart: {count}",
  "checkout.orderId": "Order ID: {id}",
  "checkout.successTitle": "Order Placed!",
  "checkout.successSubtitle": "Thank you for your order. The store has been notified.",
  "checkout.continueShopping": "Continue Shopping",
  "checkout.sendWhatsApp": "Send Order via WhatsApp",
  "checkout.whatsappHint":
    "Send the full order details straight to the store on WhatsApp",
  "checkout.whatsappMissing":
    "This store hasn't added a WhatsApp number yet. Update it in Settings.",
  "checkout.failed": "Checkout failed",

  // --------------------------------------------
  // Auth
  // --------------------------------------------
  "auth.heroTitle": "Build Your Online Store",
  "auth.heroSubtitle":
    "Create, manage, and grow your business with our powerful multi-tenant e-commerce platform.",
  "auth.loginTitle": "Welcome back",
  "auth.loginSubtitle": "Sign in to manage your store",
  "auth.signupTitle": "Create your account",
  "auth.signupSubtitle": "Start selling online in minutes",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.name": "Full Name",
  "auth.signIn": "Sign In",
  "auth.signingIn": "Signing in...",
  "auth.createAccount": "Create Account",
  "auth.creatingAccount": "Creating account...",
  "auth.noAccount": "Don't have an account?",
  "auth.hasAccount": "Already have an account?",
  "auth.signUpLink": "Sign up",
  "auth.signInLink": "Sign in",
  "auth.failed": "Login failed",
  "auth.signupFailed": "Signup failed",
  "auth.somethingWrong": "Something went wrong",

  // --------------------------------------------
  // Onboarding
  // --------------------------------------------
  "onboarding.title": "Create Your Store",
  "onboarding.subtitle": "Set up your store details to start selling",
  "onboarding.storeName": "Store Name *",
  "onboarding.storeNamePlaceholder": "My Awesome Store",
  "onboarding.storeNameHelp": "This will be displayed on your storefront and in the dashboard.",
  "onboarding.storeSlug": "Store Slug (URL) *",
  "onboarding.storeSlugPlaceholder": "my-awesome-store",
  "onboarding.storeSlugHelp": "This will be your store's URL (e.g., storehub.io/my-awesome-store).",
  "onboarding.slugUrl": "Your store URL: /store/{slug}",
  "onboarding.slugTaken": "This slug is already taken",
  "onboarding.slugAvailable": "Available",
  "onboarding.description": "Description",
  "onboarding.descriptionPlaceholder": "What does your store sell?",
  "onboarding.category": "Category",
  "onboarding.selectCategory": "Select a category",
  "onboarding.phone": "Phone",
  "onboarding.phonePlaceholder": "+20 100 123 4567",
  "onboarding.addressPlaceholder": "Cairo, Egypt",
  "onboarding.creating": "Creating store...",
  "onboarding.submit": "Create Store",
  "onboarding.createStore": "Create Store",
  "onboarding.createFailed": "Failed to create store",
  "onboarding.failed": "Failed to save store details",
  "onboarding.storeNameRequired": "Store name is required",
  "onboarding.storeSlugRequired": "Store slug is required",
  "onboarding.somethingWrong": "Something went wrong",
  "onboarding.storeCreated": "Store Created!",
  "onboarding.redirecting": "Redirecting to dashboard...",
  "onboarding.skipForNow": "Want to skip this step?",
  "onboarding.goToDashboard": "Go to Dashboard",

  // --------------------------------------------
  // Landing page
  // --------------------------------------------
  "landing.badge": "Multi-Tenant E-Commerce Platform",
  "landing.heroTitle": "Launch Your Online Store",
  "landing.heroAccent": "In Minutes",
  "landing.heroSubtitle":
    "StoreHub lets you create, manage, and grow your own online store. From product listings to order tracking, everything you need in one powerful platform.",
  "landing.startSelling": "Start Selling Today",
  "landing.learnMore": "Learn More",
  "landing.signIn": "Sign In",
  "landing.getStarted": "Get Started",
  "landing.featuresTitle": "Everything You Need",
  "landing.featuresSubtitle":
    "A complete toolkit to build and run your online business",
  "landing.feature.store.title": "Custom Storefront",
  "landing.feature.store.desc":
    "Get a unique URL for your store with your own branding, logo, and design.",
  "landing.feature.products.title": "Product Management",
  "landing.feature.products.desc":
    "Add products, set prices, manage stock, and organize by categories.",
  "landing.feature.orders.title": "Order Tracking",
  "landing.feature.orders.desc":
    "Track orders from Pending to Completed. Update statuses in real-time.",
  "landing.feature.checkout.title": "Customer Checkout",
  "landing.feature.checkout.desc":
    "Seamless checkout experience with customer details and order notes.",
  "landing.howTitle": "How It Works",
  "landing.howSubtitle": "Three simple steps to get your store up and running",
  "landing.step1.title": "Create Your Account",
  "landing.step1.desc":
    "Sign up with your email and set up your store profile in seconds.",
  "landing.step2.title": "Add Your Products",
  "landing.step2.desc":
    "Upload product details, set prices, organize by categories, and you're ready.",
  "landing.step3.title": "Start Selling",
  "landing.step3.desc":
    "Share your unique store link and start receiving orders right away.",
  "landing.ctaTitle": "Ready to Start Selling?",
  "landing.ctaSubtitle": "Join hundreds of store owners who trust StoreHub",
  "landing.ctaButton": "Create Your Free Store",
  "landing.rights": "© {year} StoreHub. All rights reserved.",
} as const;

export type TranslationKey = keyof typeof en;

const ar: Record<TranslationKey, string> = {
  // Common
  "common.save": "حفظ",
  "common.saving": "جارٍ الحفظ...",
  "common.cancel": "إلغاء",
  "common.create": "إنشاء",
  "common.update": "تحديث",
  "common.delete": "حذف",
  "common.edit": "تعديل",
  "common.close": "إغلاق",
  "common.search": "بحث",
  "common.language": "اللغة",
  "common.mute": "كتم تنبيهات الطلبات",
  "common.unmute": "تشغيل تنبيهات الطلبات",
  "common.optional": "اختياري",

  // Navigation
  "nav.dashboard": "لوحة التحكم",
  "nav.products": "المنتجات",
  "nav.categories": "الأقسام",
  "nav.orders": "الطلبات",
  "nav.customers": "العملاء",
  "nav.analytics": "التحليلات",
  "nav.billing": "الاشتراك",
  "nav.settings": "الإعدادات",
  "nav.signOut": "تسجيل الخروج",

  // Desktop notifications
  "notifications.enable": "تفعيل تنبيهات الطلبات على سطح المكتب",
  "notifications.enabled": "تنبيهات سطح المكتب مفعّلة",
  "notifications.unsupported": "الإشعارات غير مدعومة في هذا المتصفح",
  "notifications.blocked": "الإشعارات محظورة — اسمح بها من إعدادات المتصفح",

  // Dashboard home
  "home.todayOrders": "طلبات اليوم",
  "home.todaySales": "مبيعات اليوم (EGP)",
  "home.totalProducts": "إجمالي المنتجات",
  "home.pendingOrders": "الطلبات المعلقة",
  "home.recentOrders": "أحدث الطلبات",
  "home.noOrders": "لا توجد طلبات بعد. شارك رابط متجرك لبدء استقبال الطلبات!",

  // Table headers
  "table.customer": "العميل",
  "table.name": "الاسم",
  "table.phone": "الهاتف",
  "table.amount": "المبلغ",
  "table.status": "الحالة",
  "table.update": "التحديث",
  "table.date": "التاريخ",
  "table.orders": "الطلبات",
  "table.totalSpent": "إجمالي الإنفاق",
  "table.lastOrder": "آخر طلب",

  // Statuses
  "status.Pending": "معلق",
  "status.Confirmed": "مؤكد",
  "status.Preparing": "قيد التجهيز",
  "status.Ready": "جاهز",
  "status.Completed": "مكتمل",
  "status.Cancelled": "ملغي",

  // Products
  "products.searchPlaceholder": "بحث في المنتجات...",
  "products.add": "إضافة منتج",
  "products.addTitle": "إضافة منتج",
  "products.editTitle": "تعديل المنتج",
  "products.emptyTitle": "لا توجد منتجات بعد",
  "products.emptySubtitle": "أضف منتجك الأول للبدء",
  "products.field.name": "الاسم *",
  "products.field.description": "الوصف",
  "products.field.price": "السعر (EGP) *",
  "products.field.stock": "المخزون",
  "products.field.image": "صورة المنتج",
  "products.field.category": "القسم",
  "products.noCategory": "بدون قسم",
  "products.visibleLabel": "ظاهر للعملاء",
  "products.inStock": "{count} متاح في المخزون",
  "products.outOfStock": "نفذ من المخزون",
  "products.visible": "ظاهر",
  "products.hidden": "مخفي",
  "products.deleteConfirm": "هل أنت متأكد من حذف هذا المنتج؟",
  "products.toast.created": "تم إنشاء المنتج بنجاح",
  "products.toast.updated": "تم تحديث المنتج بنجاح",
  "products.toast.deleted": "تم حذف المنتج",
  "products.toast.saveFailed": "فشل حفظ المنتج",
  "products.toast.deleteFailed": "فشل حذف المنتج",
  "products.toast.visibilityFailed": "فشل تحديث حالة الظهور",
  "products.toast.limitReached":
    "تم الوصول للحد الأقصى في الخطة المجانية (15 منتجًا) — قم بالترقية إلى Pro للمنتجات غير المحدودة",
  "products.planUsage": "{used} / {limit} منتجات في الخطة المجانية",
  "products.upgrade": "الترقية إلى Pro",

  // AI assistant (shared)
  "ai.generate": "إنشاء بالذكاء الاصطناعي",
  "ai.generating": "جارٍ الإنشاء...",
  "ai.regenerate": "إعادة الإنشاء",
  "ai.failed": "فشل الإنشاء بالذكاء الاصطناعي، حاول مرة أخرى",
  "ai.mockBadge": "ذكاء اصطناعي تجريبي",
  "ai.copy": "نسخ",
  "ai.copied": "تم النسخ إلى الحافظة",
  "ai.copyFailed": "فشل النسخ",

  // Products AI description
  "products.ai.keywords": "الكلمات المفتاحية / المميزات",
  "products.ai.keywordsPlaceholder": "مثال: مقاوم للماء، خفيف، ضمان سنة",
  "products.ai.hint": "صف المميزات الرئيسية وسيكتب الذكاء الاصطناعي الوصف",
  "products.ai.needName": "أضف اسم المنتج قبل الإنشاء",
  "products.toast.aiGenerated": "تم إنشاء الوصف بنجاح",

  // Billing
  "billing.title": "الفوترة والخطة",
  "billing.subtitle": "تابع استخدام المنتجات وبدّل بين خطط الاشتراك",
  "billing.currentPlan": "الخطة الحالية",
  "billing.usageTitle": "استخدام المنتجات",
  "billing.usageLabel": "{used} من {limit} منتجات مستخدمة",
  "billing.usageUnlimited": "{used} منتج · خطة غير محدودة",
  "billing.remaining": "{count} مقاعد متبقية",
  "billing.limitReached": "تم الوصول لحد الخطة — قم بالترقية لمواصلة الإضافة",
  "billing.planFreeName": "مجانية",
  "billing.planFreePrice": "0 جنيه / شهر",
  "billing.planFreeDesc": "كل ما تحتاجه لبدء البيع عبر الإنترنت",
  "billing.planFreeLimit": "حتى 15 منتجًا",
  "billing.planProName": "Pro",
  "billing.planProPrice": "299 جنيه / شهر",
  "billing.planProDesc": "لمتاجر نامية ذات كتالوج كبير",
  "billing.planProLimit": "منتجات غير محدودة",
  "billing.currentBadge": "الخطة الحالية",
  "billing.upgrade": "الترقية إلى Pro",
  "billing.downgrade": "التحويل إلى المجانية",
  "billing.popular": "الأكثر شيوعًا",
  "billing.mockNote": "فوترة تجريبية — تبديل الخطط فوري وبدون أي دفع.",
  "billing.feature.orderTracking": "تتبع الطلبات مع تنبيهات لحظية",
  "billing.feature.analytics": "تحليلات الإيرادات والمبيعات",
  "billing.feature.priority": "دعم بأولوية",
  "billing.toast.changed": "تم تحديث الخطة إلى {plan}",
  "billing.toast.failed": "فشل تحديث الخطة",
  "billing.activation.failed": "فشل تفعيل الكود. يرجى المحاولة مرة أخرى.",
  "billing.upgradeModal.title": "الترقية إلى Pro",
  "billing.upgradeModal.step1Title": "الخطوة 1: تواصل معنا على واتساب",
  "billing.upgradeModal.step1Desc": "راسلنا لإتمام الدفع واستلام كود التفعيل الخاص بك.",
  "billing.upgradeModal.whatsappLink": "فتح محادثة واتساب",
  "billing.upgradeModal.step1AltTitle": "أو التحويل عبر فودافون كاش / إنستاباي",
  "billing.upgradeModal.step1AltDesc": "أرسل المبلغ لـ {phone}، ثم ستحصل على كود التفعيل.",
  "billing.upgradeModal.activationCodeLabel": "كود التفعيل",
  "billing.upgradeModal.activationCodePlaceholder": "أدخل كود التفعيل",
  "billing.upgradeModal.submitCode": "إرسال الكود",
  "billing.upgradeModal.successTitle": "تم تفعيل خطة Pro!",
  "billing.upgradeModal.successDesc": "متجرك أصبح يمتلك منتجات غير محدودة. أهلاً بك في Pro!",
  "billing.upgradeModal.close": "متابعة إلى لوحة التحكم",

  // Analytics
  "analytics.subtitle": "اتجاهات الإيرادات والأكثر مبيعًا ومتوسط قيمة الطلب",
  "analytics.totalRevenue": "إجمالي الإيرادات (EGP)",
  "analytics.totalOrders": "إجمالي الطلبات",
  "analytics.aov": "متوسط قيمة الطلب (EGP)",
  "analytics.avgDaily": "متوسط الإيرادات اليومية (EGP)",
  "analytics.revenueTrend": "اتجاه الإيرادات",
  "analytics.aovTrend": "اتجاه متوسط قيمة الطلب",
  "analytics.daily": "يومي",
  "analytics.weekly": "أسبوعي",
  "analytics.topProducts": "أفضل 5 منتجات مبيعًا",
  "analytics.topProductsEmpty": "لا توجد مبيعات بعد — تظهر أفضل المنتجات بعد أول الطلبات",
  "analytics.chartEmpty": "لا توجد بيانات إيرادات في هذه الفترة",
  "analytics.soldCount": "{count} مبيع",
  "analytics.ordersCount": "{count} طلب",

  // AI business insights
  "analytics.insights.title": "رؤى أعمال بالذكاء الاصطناعي",
  "analytics.insights.subtitle": "3 توصيات عملية مولّدة من بيانات تحليلات متجرك",
  "analytics.insights.generate": "إنشاء التوصيات",
  "analytics.insights.generating": "جارٍ تحليل متجرك...",
  "analytics.insights.pending":
    "أنشئ التوصيات لترى اقتراحات مبنية على أرقام متجرك",
  "analytics.insights.failed": "فشل إنشاء التوصيات، حاول مرة أخرى",
  "analytics.insights.unavailable": "حمّل بيانات التحليلات أولًا ثم أنشئ التوصيات",

  // Marketing (AI social posts)
  "nav.marketing": "التسويق",
  "marketing.subtitle": "أنشئ منشورات تسويقية عربية جاهزة للنشر لمنتجاتك",
  "marketing.product": "المنتج",
  "marketing.selectProduct": "اختر منتجًا",
  "marketing.platform": "المنصة",
  "marketing.platform.facebook": "فيسبوك",
  "marketing.platform.instagram": "إنستجرام",
  "marketing.platform.tiktok": "تيك توك",
  "marketing.angle": "زاوية الترويج",
  "marketing.anglePlaceholder": "مثال: خصم نهاية الأسبوع، توصيل مجاني، وصول جديد",
  "marketing.generate": "إنشاء المنشور",
  "marketing.generating": "جارٍ إنشاء المنشور...",
  "marketing.output": "المنشور الذي تم إنشاؤه",
  "marketing.outputPlaceholder": "سيظهر المنشور الذي تم إنشاؤه هنا",
  "marketing.emptyTitle": "لا توجد منتجات بعد",
  "marketing.emptySubtitle": "أضف منتجات أولًا ليكتب الذكاء الاصطناعي منشورات عنها",
  "marketing.loadingProducts": "جارٍ تحميل منتجاتك...",
  "marketing.postFor": "منشور لـ {product} · {platform}",
  "marketing.toast.generated": "تم إنشاء المنشور التسويقي",
  "marketing.toast.failed": "فشل إنشاء المنشور",

  // Uploads
  "upload.choose": "رفع صورة",
  "upload.inProgress": "جارٍ الرفع...",
  "upload.pasteUrl": "…أو الصق رابط الصورة",
  "upload.remove": "إزالة الصورة",
  "upload.invalidType":
    "يُسمح بملفات الصور فقط (JPG, PNG, WebP, GIF, AVIF, SVG)",
  "upload.tooLarge": "حجم الملف كبير جدًا (الحد الأقصى 5 ميجابايت)",
  "upload.notConfigured":
    "خدمة Supabase Storage غير مُهيّأة. أضف SUPABASE_JWT_SECRET في ملف البيئة.",
  "upload.failed": "فشل رفع الصورة، حاول مرة أخرى",

  // Categories
  "categories.countOne": "قسم واحد",
  "categories.countMany": "{count} أقسام",
  "categories.add": "إضافة قسم",
  "categories.newTitle": "قسم جديد",
  "categories.field.name": "اسم القسم *",
  "categories.placeholder": "مثال: إلكترونيات",
  "categories.emptyTitle": "لا توجد أقسام بعد",
  "categories.emptySubtitle": "أنشئ أقسامًا لتنظيم منتجاتك",
  "categories.createdOn": "تم الإنشاء في {date}",
  "categories.deleteConfirm":
    "هل أنت متأكد؟ المنتجات في هذا القسم ستفقد تصنيفها.",
  "categories.toast.created": "تم إنشاء القسم بنجاح",
  "categories.toast.deleted": "تم حذف القسم",
  "categories.toast.failed": "تعذّر إنشاء القسم",

  // Orders
  "orders.filterAll": "الكل",
  "orders.emptyTitle": "لا توجد طلبات بعد",
  "orders.emptySubtitle": "ستظهر الطلبات هنا عند إجراء العملاء للشراء",
  "orders.toast.updated": "تم تحديث حالة الطلب",
  "orders.toast.failed": "فشل تحديث الحالة",
  "orders.live": "مباشر",
  "orders.connecting": "جارٍ الاتصال…",
  "orders.polling": "تحديث تلقائي",
  "orders.newOrderTitle": "طلب جديد",
  "orders.newOrderToast": "طلب جديد من {name}",
  "orders.notes": "ملاحظات",

  // Customers
  "customers.subtitle":
    "ملخص بيانات العملاء مجمّعة من طلبات متجرك حسب رقم الهاتف",
  "customers.searchPlaceholder": "بحث بالاسم أو رقم الهاتف...",
  "customers.totalCustomers": "إجمالي العملاء",
  "customers.totalRevenue": "إجمالي الإيرادات (EGP)",
  "customers.repeatCustomers": "عملاء متكررون",
  "customers.avgOrder": "متوسط قيمة الطلب (EGP)",
  "customers.emptyTitle": "لا يوجد عملاء بعد",
  "customers.emptySubtitle": "ستظهر بيانات العملاء بعد أول طلب",
  "customers.noPhone": "بدون هاتف",
  "customers.showing": "عرض {count} من {total} عميل",

  // Settings
  "settings.title": "إعدادات المتجر",
  "settings.storeName": "اسم المتجر",
  "settings.description": "الوصف",
  "settings.category": "التصنيف",
  "settings.selectCategory": "اختر تصنيفًا",
  "settings.phone": "الهاتف",
  "settings.address": "العنوان",
  "settings.logo": "الشعار",
  "settings.cover": "صورة الغلاف",
  "settings.brandColor": "لون العلامة التجارية",
  "settings.brandColorHint": "يُطبَّق على الأزرار والأسعار والعناوين في واجهة متجرك",
  "settings.brandColorDefault": "الافتراضي",
  "settings.brandColorCustom": "لون مخصص",
  "settings.brandColorPreview": "معاينة",
  "settings.toast.saved": "تم تحديث إعدادات المتجر بنجاح",
  "settings.toast.failed": "فشل حفظ الإعدادات",
  "settings.toast.assetRemoved": "تمت إزالة الصورة",

  // Store categories
  "category.Fashion": "أزياء",
  "category.Electronics": "إلكترونيات",
  "category.Food & Drinks": "أطعمة ومشروبات",
  "category.Home & Garden": "منزل وحديقة",
  "category.Beauty": "جمال",
  "category.Sports": "رياضة",
  "category.Books": "كتب",
  "category.Other": "أخرى",
  "category.retail": "تجزئة",
  "category.electronics": "إلكترونيات",
  "category.fashion": "أزياء",
  "category.food": "أطعمة ومشروبات",
  "category.health": "صحة",
  "category.home": "منزل وحديقة",
  "category.sports": "رياضة",
  "category.beauty": "جمال",
  "category.automotive": "سيارات",
  "category.books": "كتب",
  "category.other": "أخرى",

  // Storefront
  "store.searchPlaceholder": "بحث في المنتجات...",
  "store.all": "الكل",
  "store.addToCart": "أضف إلى السلة",
  "store.outOfStock": "نفذ من المخزون",
  "store.left": "متبقي {count}",
  "store.cartTitle": "السلة ({count})",
  "store.cartEmpty": "سلتك فارغة",
  "store.total": "الإجمالي",
  "store.checkout": "الذهاب إلى الدفع",
  "store.clearCart": "إفراغ السلة",
  "store.noProducts": "لا توجد منتجات",
  "store.language": "اللغة",
  "store.notFoundTitle": "المتجر غير موجود",
  "store.notFoundSubtitle": "المتجر الذي تبحث عنه غير موجود.",
  "store.goHome": "الانتقال للرئيسية",
  "store.poweredBy": "مدعوم بواسطة StoreHub",

  // Product detail page
  "product.backToStore": "العودة إلى المتجر",
  "product.description": "الوصف",
  "product.quantity": "الكمية",
  "product.addedToCart": "تمت الإضافة إلى السلة",
  "product.notFoundTitle": "المنتج غير موجود",
  "product.notFoundSubtitle": "هذا المنتج غير موجود أو لم يعد متاحًا.",

  // Errors & 404
  "error.title": "حدث خطأ ما",
  "error.subtitle": "حدث خطأ غير متوقع. حاول مرة أخرى.",
  "error.retry": "إعادة المحاولة",
  "notFound.title": "الصفحة غير موجودة",
  "notFound.subtitle": "الصفحة التي تبحث عنها غير موجودة.",

  // Checkout
  "checkout.customerDetails": "بيانات العميل",
  "checkout.orderSummary": "ملخص الطلب",
  "checkout.name": "الاسم *",
  "checkout.namePlaceholder": "اسمك الكامل",
  "checkout.phone": "الهاتف",
  "checkout.phonePlaceholder": "+20 100 123 4567",
  "checkout.address": "عنوان التوصيل",
  "checkout.addressPlaceholder": "عنوان التوصيل الخاص بك",
  "checkout.notes": "ملاحظات الطلب",
  "checkout.notesPlaceholder": "أي تعليمات خاصة...",
  "checkout.placeOrder": "تأكيد الطلب",
  "checkout.placingOrder": "جارٍ إتمام الطلب...",
  "checkout.itemsInCart": "عدد عناصر السلة: {count}",
  "checkout.orderId": "رقم الطلب: {id}",
  "checkout.successTitle": "تم إنشاء الطلب!",
  "checkout.successSubtitle": "شكرًا لطلبك، تم إبلاغ المتجر بالفعل.",
  "checkout.continueShopping": "مواصلة التسوق",
  "checkout.sendWhatsApp": "إرسال الطلب عبر واتساب",
  "checkout.whatsappHint": "شارك تفاصيل طلبك كاملة مع المتجر مباشرة على واتساب",
  "checkout.whatsappMissing":
    "لم يضف صاحب المتجر رقم واتساب بعد. يمكنك تحديثه من الإعدادات.",
  "checkout.failed": "تعذّر إتمام الطلب",

  // Auth
  "auth.heroTitle": "أنشئ متجرك الإلكتروني",
  "auth.heroSubtitle":
    "أنشئ متجرك وأدره ونمِّه أعمالك عبر منصتنا القوية للتجارة الإلكترونية متعددة المتاجر.",
  "auth.loginTitle": "مرحبًا بعودتك",
  "auth.loginSubtitle": "سجّل الدخول لإدارة متجرك",
  "auth.signupTitle": "أنشئ حسابك",
  "auth.signupSubtitle": "ابدأ البيع عبر الإنترنت خلال دقائق",
  "auth.email": "البريد الإلكتروني",
  "auth.password": "كلمة المرور",
  "auth.name": "الاسم الكامل",
  "auth.signIn": "تسجيل الدخول",
  "auth.signingIn": "جارٍ تسجيل الدخول...",
  "auth.createAccount": "إنشاء الحساب",
  "auth.creatingAccount": "جارٍ إنشاء الحساب...",
  "auth.noAccount": "ليس لديك حساب؟",
  "auth.hasAccount": "لديك حساب بالفعل؟",
  "auth.signUpLink": "سجّل الآن",
  "auth.signInLink": "تسجيل الدخول",
  "auth.failed": "فشل تسجيل الدخول",
  "auth.signupFailed": "فشل إنشاء الحساب",
  "auth.somethingWrong": "حدث خطأ ما",

  // Onboarding
  "onboarding.title": "أنشئ متجرك",
  "onboarding.subtitle": "أدخل بيانات متجرك لبدء البيع",
  "onboarding.storeName": "اسم المتجر *",
  "onboarding.storeNamePlaceholder": "متجري الرائع",
  "onboarding.storeNameHelp": "سيظهر هذا على واجهة متجرك وفي لوحة التحكم.",
  "onboarding.storeSlug": "رابط المتجر (Slug) *",
  "onboarding.storeSlugPlaceholder": "my-awesome-store",
  "onboarding.storeSlugHelp": "هذا سيكون رابط متجرك (مثلاً: storehub.io/my-awesome-store).",
  "onboarding.slugUrl": "رابط متجرك: ‎/store/{slug}",
  "onboarding.slugTaken": "هذا الرابط محجوز بالفعل",
  "onboarding.slugAvailable": "متاح",
  "onboarding.description": "الوصف",
  "onboarding.descriptionPlaceholder": "ماذا يبيع متجرك؟",
  "onboarding.category": "التصنيف",
  "onboarding.selectCategory": "اختر تصنيفًا",
  "onboarding.phone": "الهاتف",
  "onboarding.phonePlaceholder": "+20 100 123 4567",
  "onboarding.addressPlaceholder": "القاهرة، مصر",
  "onboarding.creating": "جارٍ إنشاء المتجر...",
  "onboarding.submit": "إنشاء المتجر",
  "onboarding.createStore": "إنشاء المتجر",
  "onboarding.createFailed": "فشل إنشاء المتجر",
  "onboarding.failed": "فشل حفظ بيانات المتجر",
  "onboarding.storeNameRequired": "اسم المتجر مطلوب",
  "onboarding.storeSlugRequired": "رابط المتجر مطلوب",
  "onboarding.somethingWrong": "حدث خطأ ما",
  "onboarding.storeCreated": "تم إنشاء المتجر!",
  "onboarding.redirecting": "جاري التوجيه إلى لوحة التحكم...",
  "onboarding.skipForNow": "تريد تخطي هذه الخطوة؟",
  "onboarding.goToDashboard": "الذهاب للوحة التحكم",

  // Landing page
  "landing.badge": "منصة تجارة إلكترونية متعددة المتاجر",
  "landing.heroTitle": "أطلق متجرك الإلكتروني",
  "landing.heroAccent": "في دقائق",
  "landing.heroSubtitle":
    "تساعدك StoreHub على إنشاء متجرك وإدارته وتنمية أعمالك. من عرض المنتجات إلى تتبع الطلبات، كل ما تحتاجه في منصة واحدة قوية.",
  "landing.startSelling": "ابدأ البيع اليوم",
  "landing.learnMore": "اعرف المزيد",
  "landing.signIn": "تسجيل الدخول",
  "landing.getStarted": "ابدأ الآن",
  "landing.featuresTitle": "كل ما تحتاجه",
  "landing.featuresSubtitle": "أدوات متكاملة لبناء وإدارة أعمالك عبر الإنترنت",
  "landing.feature.store.title": "واجهة متجر مخصصة",
  "landing.feature.store.desc":
    "احصل على رابط فريد لمتجرك بهويتك وشعارك وتصميمك الخاص.",
  "landing.feature.products.title": "إدارة المنتجات",
  "landing.feature.products.desc":
    "أضف المنتجات وحدّد الأسعار وأدر المخزون ونظّمها بالأقسام.",
  "landing.feature.orders.title": "تتبع الطلبات",
  "landing.feature.orders.desc":
    "تابع الطلبات من المعلق إلى المكتمل وحدّث الحالات فوريًا.",
  "landing.feature.checkout.title": "دفع سلس للعملاء",
  "landing.feature.checkout.desc":
    "تجربة دفع سهلة مع بيانات العميل وملاحظات الطلب.",
  "landing.howTitle": "كيف يعمل",
  "landing.howSubtitle": "ثلاث خطوات بسيطة لإطلاق متجرك",
  "landing.step1.title": "أنشئ حسابك",
  "landing.step1.desc": "سجّل ببريدك الإلكتروني وأنشئ ملف متجرك في ثوانٍ.",
  "landing.step2.title": "أضف منتجاتك",
  "landing.step2.desc":
    "أضف تفاصيل المنتجات والأسعار ونظّمها بالأقسام وأنت جاهز.",
  "landing.step3.title": "ابدأ البيع",
  "landing.step3.desc": "شارك رابط متجرك الفريد وابدأ في استقبال الطلبات فورًا.",
  "landing.ctaTitle": "مستعد لبدء البيع؟",
  "landing.ctaSubtitle": "انضم إلى مئات أصحاب المتاجر الذين يثقون بـ StoreHub",
  "landing.ctaButton": "أنشئ متجرك مجانًا",
  "landing.rights": "© {year} StoreHub. جميع الحقوق محفوظة.",
};

const dictionaries: Record<Locale, Record<TranslationKey, string>> = {
  en,
  ar,
};

export type TranslationVars = Record<string, string | number>;

function interpolate(template: string, vars?: TranslationVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match
  );
}

export function translate(
  locale: Locale,
  key: TranslationKey,
  vars?: TranslationVars
): string {
  const dictionary = dictionaries[locale] ?? dictionaries.en;
  return interpolate(dictionary[key] ?? dictionaries.en[key], vars);
}

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "ar";
}

export function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // Ignore storage errors and fall through to the browser language.
  }
  const browserArabic =
    typeof navigator !== "undefined" &&
    navigator.language.toLowerCase().startsWith("ar");
  return browserArabic ? "ar" : "en";
}

export function applyDocumentDirection(locale: Locale): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
}

interface I18nContextValue {
  locale: Locale;
  dir: "ltr" | "rtl";
  isRtl: boolean;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (key: TranslationKey, vars?: TranslationVars) => string;
  formatMoney: (amount: string | number) => string;
  formatNumber: (value: number) => string;
  formatDate: (value: string | number | Date) => string;
  formatDateTime: (value: string | number | Date) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const localeListeners = new Set<() => void>();
let clientLocale: Locale | null = null;
let localeStorageBound = false;

function notifyLocaleListeners(): void {
  localeListeners.forEach((listener) => listener());
}

function readClientLocale(): Locale {
  if (clientLocale === null) clientLocale = detectInitialLocale();
  return clientLocale;
}

function readServerLocale(initialLocale: Locale): Locale {
  return initialLocale;
}

function subscribeLocale(listener: () => void): () => void {
  if (!localeStorageBound && typeof window !== "undefined") {
    localeStorageBound = true;
    window.addEventListener("storage", (event) => {
      if (event.key !== LOCALE_STORAGE_KEY) return;
      clientLocale = null;
      notifyLocaleListeners();
    });
  }

  localeListeners.add(listener);
  return () => {
    localeListeners.delete(listener);
  };
}

function commitLocale(next: Locale): void {
  clientLocale = next;
  applyDocumentDirection(next);
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    document.cookie = `${LOCALE_STORAGE_KEY}=${next};path=/;max-age=31536000;SameSite=Lax`;
  } catch {
    // Ignore storage errors — direction still applies for this session.
  }
  notifyLocaleListeners();
}

export function I18nProvider({
  children,
  initialLocale = "en",
}: { children: ReactNode; initialLocale?: Locale }) {
  const locale = useSyncExternalStore(
    subscribeLocale,
    readClientLocale,
    () => readServerLocale(initialLocale)
  );

  // Keep `<html lang>` / `dir` in sync once the resolved locale is known.
  useEffect(() => {
    applyDocumentDirection(locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    commitLocale(next);
  }, []);

  const toggleLocale = useCallback(() => {
    commitLocale(readClientLocale() === "ar" ? "en" : "ar");
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const numberLocale = locale === "ar" ? "ar-EG-u-nu-latn" : "en-US";

    return {
      locale,
      dir: locale === "ar" ? "rtl" : "ltr",
      isRtl: locale === "ar",
      setLocale,
      toggleLocale,
      t: (key, vars) => translate(locale, key, vars),
      formatMoney: (amount) => {
        const numeric =
          typeof amount === "number" ? amount : parseFloat(amount || "0");
        const safe = Number.isFinite(numeric) ? numeric : 0;
        return `EGP ${safe.toLocaleString(numberLocale, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
      },
      formatNumber: (value) =>
        value.toLocaleString(numberLocale, { maximumFractionDigits: 0 }),
      formatDate: (input) =>
        new Intl.DateTimeFormat(numberLocale, { dateStyle: "medium" }).format(
          new Date(input)
        ),
      formatDateTime: (input) =>
        new Intl.DateTimeFormat(numberLocale, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(input)),
    };
  }, [locale, setLocale, toggleLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within <I18nProvider>");
  }
  return context;
}
