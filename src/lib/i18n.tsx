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

import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  isLocale,
  type Locale,
} from "@/lib/locale";

export { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, isLocale };
export type { Locale };

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
  "nav.shipping": "Shipping & Labels",
  "nav.customers": "Customers",
  "nav.analytics": "Analytics",
  "nav.promotions": "Promotions & Flash Sales",
  "nav.billing": "Billing",
  "nav.settings": "Settings",
  "nav.aiRadar": "AI Radar",
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
  "table.address": "Address",
  "table.risk": "Risk",
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
  "status.Shipped": "Shipped",
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
  "marketing.platform.whatsapp": "WhatsApp",
  "marketing.platform.ad": "Ad Headline",
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
  // Promotions & Flash Sales
  // --------------------------------------------
  "promos.badge.hot": "HOT",
  "promos.subtitle":
    "Launch timed flash sales and coupon codes that convert",
  "promos.card.couponRevenue": "Revenue from Coupons",
  "promos.card.flashStatus": "Flash Sale Status",
  "promos.card.noActive": "No flash sale running",
  "promos.card.topCodes": "Top Redeemed Codes",
  "promos.card.noRedemptions": "No coupon redemptions yet",
  "promos.card.redemptionCount": "{count} redeemed orders",
  "promos.status.live": "Live",
  "promos.status.scheduled": "Scheduled",
  "promos.status.ended": "Ended",
  "promos.status.paused": "Paused",
  "promos.builder.title": "Flash Sale Builder",
  "promos.builder.subtitle":
    "Schedule a targeted discount with a live countdown banner",
  "promos.field.title": "Campaign title *",
  "promos.field.titlePlaceholder": "e.g. Weekend Flash Sale",
  "promos.field.discount": "Discount (%) *",
  "promos.field.start": "Starts *",
  "promos.field.end": "Ends *",
  "promos.field.bannerText": "Banner text",
  "promos.field.bannerTextPlaceholder": "Limited time only — while stocks last!",
  "promos.field.showBanner": "Show live countdown banner on the storefront",
  "promos.field.targets": "Applies to",
  "promos.target.all": "All products",
  "promos.target.products": "Specific products",
  "promos.target.categories": "Specific categories",
  "promos.target.selectProducts": "Select at least one product",
  "promos.target.selectCategories": "Select at least one category",
  "promos.create": "Launch Flash Sale",
  "promos.creating": "Launching...",
  "promos.preview": "Live banner preview",
  "promos.preview.startsIn": "Starts in",
  "promos.preview.endsIn": "Ends in",
  "promos.list.title": "Your Flash Sales",
  "promos.list.empty": "No flash sales yet — create your first one above",
  "promos.list.deleteConfirm": "Delete this flash sale?",
  "promos.list.toggleLabel": "Enable flash sale",
  "promos.list.appliesToAll": "All products",
  "promos.list.productsCount": "{count} products",
  "promos.list.categoriesCount": "{count} categories",
  "promos.coupons.title": "Coupon Code Generator",
  "promos.coupons.subtitle":
    "One click for a fresh code — set the discount, limit and expiry",
  "promos.coupons.generate": "Generate code",
  "promos.coupons.code": "Code *",
  "promos.coupons.discount": "Discount amount *",
  "promos.coupons.minSpend": "Minimum spend",
  "promos.coupons.maxUses": "Usage limit",
  "promos.coupons.expires": "Expires at",
  "promos.coupons.neverExpires": "Never expires",
  "promos.coupons.create": "Create Coupon",
  "promos.coupons.creating": "Creating...",
  "promos.coupons.empty": "No coupons yet",
  "promos.coupons.usage": "{used} / {max} used",
  "promos.coupons.deleteConfirm": "Delete this coupon?",
  "promos.coupons.status.active": "Active",
  "promos.coupons.status.expired": "Expired",
  "promos.coupons.status.exhausted": "Exhausted",
  "promos.toast.created": "Flash sale launched",
  "promos.toast.createFailed": "Failed to launch flash sale",
  "promos.toast.updated": "Flash sale updated",
  "promos.toast.updateFailed": "Failed to update flash sale",
  "promos.toast.deleted": "Flash sale deleted",
  "promos.toast.deleteFailed": "Failed to delete flash sale",
  "promos.toast.couponCreated": "Coupon created",
  "promos.toast.couponCreateFailed": "Failed to create coupon",
  "promos.toast.couponDeleted": "Coupon deleted",
  "promos.toast.couponDeleteFailed": "Failed to delete coupon",
  "promos.error.titleRequired": "Campaign title is required",
  "promos.error.dates": "End time must be after start time",
  "promos.error.discountRange": "Discount must be between 1 and 100",
  "promos.error.selectTargets": "Select at least one product or category",
  "promos.error.codeRequired": "Coupon code is required",
  "promos.error.positiveDiscount": "Discount amount must be greater than 0",

  // Storefront flash sale banner
  "store.flash.startsIn": "Starts in",
  "store.flash.endsIn": "Ends in",
  "store.flash.off": "{percent}% OFF",
  "store.flash.sale": "Flash Sale",

  // Checkout coupon
  "checkout.coupon.title": "Coupon Code",
  "checkout.coupon.placeholder": "e.g. SAVE20-XYZ",
  "checkout.coupon.apply": "Apply",
  "checkout.coupon.applying": "Checking...",
  "checkout.coupon.applied": "Coupon applied",
  "checkout.coupon.remove": "Remove",
  "checkout.coupon.discount": "Coupon discount",
  "checkout.coupon.failed": "Could not apply coupon",
  "checkout.coupon.error.COUPON_NOT_FOUND": "This coupon code does not exist",
  "checkout.coupon.error.COUPON_EXPIRED": "This coupon has expired",
  "checkout.coupon.error.COUPON_EXHAUSTED":
    "This coupon has reached its usage limit",
  "checkout.coupon.error.MIN_SPEND_NOT_MET":
    "Your cart does not meet this coupon's minimum spend",

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
  // Order tracking (customer-facing)
  "orders.title": "Track Your Order",
  "orders.searchTitle": "Find Your Order",
  "orders.searchBy": "Search By",
  "orders.searchByOrderId": "Order ID",
  "orders.searchByPhone": "Phone Number",
  "orders.orderIdPlaceholder": "Enter your Order ID",
  "orders.phonePlaceholder": "Enter your Phone Number",
  "orders.search": "Search",
  "orders.searching": "Searching...",
  "orders.enterOrderIdOrPhone": "Please enter an Order ID or Phone Number",
  "orders.notFound": "Order not found",
  "orders.searchFailed": "Failed to search for order",
  "orders.orderDetails": "Order #{id}",
  "orders.customerInfo": "Customer Information",
  "orders.orderSummary": "Order Summary",
  "orders.itemsCount": "Items",
  "orders.items": "Order Items",
  "orders.productRemoved": "Product removed",
  "orders.quantity": "Qty: {count}",
  "orders.canCancel": "You can cancel this order",
  "orders.canCancelDescription": "This order is still pending and can be cancelled. Items will be restocked.",
  "orders.confirmCancel": "Are you sure you want to cancel this order? This action cannot be undone.",
  "orders.cancelling": "Cancelling...",
  "orders.cancelOrder": "Cancel Order",
  "orders.cancelFailed": "Failed to cancel order",
  "orders.status.pending": "Pending",
  "orders.status.confirmed": "Confirmed",
  "orders.status.preparing": "Preparing",
  "orders.status.ready": "Ready",
  "orders.status.shipped": "Shipped",
  "orders.status.completed": "Completed",
  "orders.status.cancelled": "Cancelled",
  "orders.continueShopping": "Continue Shopping",
  "orders.backToStore": "Back to Store",
  "orders.subtitle": "Track your delivery in real time and download your invoice",
  "orders.invalidOrderId": "Please enter a valid Order ID",
  "orders.invalidPhone": "Please enter a valid phone number",
  "orders.notFoundTitle": "No Order Found",
  "orders.notFoundSubtitle":
    "We couldn't find an order with these details. Double-check your Order ID or phone number and try again.",
  "orders.notFoundAction": "Search Again",
  "orders.refresh": "Refresh status",
  "orders.autoRefresh": "Status refreshes automatically every 30 seconds",
  "orders.timeline.title": "Order Status",
  "orders.timeline.received": "Order Placed",
  "orders.timeline.receivedDesc": "We have received your order",
  "orders.timeline.processing": "In Preparation",
  "orders.timeline.processingDesc": "The store is preparing your items",
  "orders.timeline.shipped": "Out for Delivery",
  "orders.timeline.shippedDesc": "Your order is on its way",
  "orders.timeline.delivered": "Delivered",
  "orders.timeline.deliveredDesc": "Your order has been delivered",
  "orders.timeline.cancelled": "Order Cancelled",
  "orders.timeline.cancelledDesc": "This order was cancelled and will not be delivered.",
  "orders.invoice.title": "Invoice / Receipt",
  "orders.invoice.open": "Download / Print Invoice",
  "orders.invoice.print": "Print / Save as PDF",
  "orders.invoice.billTo": "Bill To",
  "orders.invoice.invoiceNo": "Invoice No.",
  "orders.invoice.date": "Date",
  "orders.invoice.item": "Item",
  "orders.invoice.qty": "Qty",
  "orders.invoice.unitPrice": "Unit Price",
  "orders.invoice.subtotal": "Subtotal",
  "orders.invoice.shipping": "Shipping",
  "orders.invoice.tax": "Tax",
  "orders.invoice.total": "Total",
  "orders.invoice.free": "Free",
  "orders.invoice.included": "Included",
  "orders.invoice.scanToVerify": "Scan to verify this receipt online",
  "orders.invoice.thankYou": "Thank you for your purchase!",

  // --------------------------------------------
  // Smart Shipping & Thermal Label Studio
  // --------------------------------------------
  "shipping.subtitle":
    "Manage delivery zones, print thermal waybills and dispatch fulfilled orders",
  "shipping.tab.zones": "Shipping Zones & Rates",
  "shipping.tab.orders": "Orders Ready for Shipping",
  "shipping.badge.pending": "{count} orders awaiting fulfillment",
  "shipping.zones.title": "Delivery Zones",
  "shipping.zones.subtitle": "Delivery fee per region — applied at checkout",
  "shipping.zones.add": "Add Zone",
  "shipping.zones.editing": "Editing zone",
  "shipping.zones.emptyTitle": "No shipping zones yet",
  "shipping.zones.emptySubtitle":
    "Create your first delivery zone or start from an Egyptian preset below",
  "shipping.zones.presets": "Quick presets",
  "shipping.zones.field.name": "Zone Name *",
  "shipping.zones.field.namePlaceholder": "e.g. Cairo",
  "shipping.zones.field.rate": "Rate (EGP) *",
  "shipping.zones.field.days": "Est. Delivery (days)",
  "shipping.zones.active": "Active",
  "shipping.zones.inactive": "Inactive",
  "shipping.zones.eta": "{days}-day delivery",
  "shipping.zones.deleteConfirm": "Delete this delivery zone?",
  "shipping.zones.toast.created": "Delivery zone created",
  "shipping.zones.toast.updated": "Delivery zone updated",
  "shipping.zones.toast.deleted": "Delivery zone deleted",
  "shipping.zones.toast.createFailed": "Failed to create delivery zone",
  "shipping.zones.toast.updateFailed": "Failed to update delivery zone",
  "shipping.zones.toast.deleteFailed": "Failed to delete delivery zone",
  "shipping.zones.error.name": "Zone name is required",
  "shipping.zones.error.rate": "Enter a valid delivery rate",
  "shipping.orders.emptyTitle": "All orders are fulfilled",
  "shipping.orders.emptySubtitle":
    "New unfulfilled orders will show up here ready for their thermal labels",
  "shipping.orders.selectAll": "Select all",
  "shipping.orders.selected": "{count} selected",
  "shipping.orders.courier": "Courier",
  "shipping.orders.courierNone": "Courier (optional)",
  "shipping.orders.zone": "Delivery Zone",
  "shipping.orders.zoneNone": "No zone",
  "shipping.orders.zoneUnassigned": "Unassigned",
  "shipping.orders.tracking": "Tracking #",
  "shipping.orders.noTracking": "No label yet",
  "shipping.orders.labelPrinted": "Label printed",
  "shipping.orders.fallbackStoreName": "My Store",
  "shipping.orders.cod": "COD",
  "shipping.orders.itemsCount": "{count} items",
  "shipping.orders.printLabels": "Print Thermal Labels",
  "shipping.orders.markShipped": "Mark as Shipped",
  "shipping.orders.printing": "Preparing labels…",
  "shipping.orders.shipping": "Shipping…",
  "shipping.orders.error.selectFirst": "Select at least one order first",
  "shipping.orders.toast.labelsReady": "{count} thermal labels ready",
  "shipping.orders.toast.labelsFailed": "Failed to prepare thermal labels",
  "shipping.orders.toast.shipped": "{count} orders marked as shipped",
  "shipping.orders.toast.shipFailed": "Failed to mark orders as shipped",
  "shipping.orders.toast.zoneAssigned": "Delivery zone assigned",
  "shipping.orders.toast.zoneFailed": "Failed to assign delivery zone",
  "shipping.orders.toast.markedPrinted": "Labels marked as printed",
  "shipping.label.title": "Thermal Label Studio",
  "shipping.label.subtitle": "{count} labels — print on 4×6 or 80mm paper",
  "shipping.label.print": "Print labels",
  "shipping.label.from": "From",
  "shipping.label.to": "Ship To",
  "shipping.label.phone": "Phone",
  "shipping.label.zone": "Zone",
  "shipping.label.courier": "Courier",
  "shipping.label.tracking": "Tracking",
  "shipping.label.order": "Order",
  "shipping.label.items": "Items",
  "shipping.label.cod": "CASH ON DELIVERY",
  "shipping.label.codAmount": "Collect {amount}",
  "shipping.label.codNote": "Collect the full amount from the customer",
  "shipping.label.scan": "Scan to track your order live",
  "shipping.label.paper4x6": "4×6 in",
  "shipping.label.paper80": "80mm receipt",
  "shipping.label.noZone": "Unassigned zone",

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
  // Theme settings
  "settings.themeSettingsTitle": "Theme Settings",
  "settings.themeTemplate": "Theme Template",
  "settings.primaryColor": "Primary Color",
  "settings.colorHint": "Hex color (e.g. #4f46e5)",
  "settings.secondaryColor": "Secondary Color",
  "settings.backgroundColor": "Background Color",
  "settings.fontFamily": "Font Family",
  "settings.borderRadius": "Border Radius",
  "settings.heroStyle": "Hero Layout Style",
  "settings.showAnnouncementBar": "Show Announcement Bar",
  "settings.announcementText": "Announcement Text",
  "settings.announcementTextPlaceholder": "Enter announcement text",

  // Domain Settings
  // --------------------------------------------
  "domain.title": "Custom Domain",
  "domain.subtitle": "Connect your own domain to your store (e.g., shop.yourbrand.com)",
  "domain.currentDomain": "Current Domain",
  "domain.inputLabel": "Enter your domain",
  "domain.inputPlaceholder": "shop.example.com",
  "domain.inputHint": "Enter your domain without http:// or https://",
  "domain.add": "Add Domain",
  "domain.remove": "Remove Domain",
  "domain.verifyNow": "Verify DNS",
  "domain.verified": "Verified",
  "domain.status.active": "Active & SSL Secured",
  "domain.status.pending": "Pending DNS Verification",
  "domain.status.notConfigured": "Not Configured",
  "domain.dnsRecords": "DNS Records",
  "domain.dns.type": "Type",
  "domain.dns.name": "Name",
  "domain.dns.value": "Value",
  "domain.dns.status": "Status",
  "domain.verification.pending": "Pending",
  "domain.verification.verified": "Verified",
  "domain.verification.failed": "Failed",
  "domain.dnsInstructions": "DNS Configuration Instructions",
  "domain.dns.cname": "CNAME Record",
  "domain.dns.aRecord": "A Record (for apex domain)",
  "domain.dns.note": "DNS changes may take up to 48 hours to propagate. After configuring, click 'Verify DNS' to check status.",
  "domain.showInstructions": "Show DNS Instructions",
  "domain.hideInstructions": "Hide DNS Instructions",
  "domain.confirmRemove": "Are you sure you want to remove the custom domain? This will revert your store to the default storehub.app subdomain.",
  "domain.visitStore": "Visit Store",
  "domain.copy": "Copy",
  "domain.mockMode": "Demo Mode",
  "domain.toast.added": "Custom domain added successfully. Configure DNS records and verify.",
  "domain.toast.addFailed": "Failed to add custom domain",
  "domain.toast.verified": "Domain verified successfully! SSL certificate is being provisioned.",
  "domain.toast.notVerified": "DNS records not yet verified. Please check your DNS configuration.",
  "domain.toast.verifyFailed": "Failed to verify domain",
  "domain.toast.removed": "Custom domain removed successfully",
  "domain.toast.removeFailed": "Failed to remove custom domain",
  "domain.toast.copied": "Copied to clipboard",

  // Currency Settings
  // --------------------------------------------
  "currency.title": "Currency Settings",
  "currency.subtitle": "Configure your store's base currency and supported currencies for international customers",
  "currency.baseCurrency": "Base Currency",
  "currency.baseCurrencyHint": "The primary currency for your store. All product prices are stored in this currency.",
  "currency.supportedCurrencies": "Supported Currencies",
  "currency.supportedCurrenciesHint": "Enable additional currencies your customers can use to view prices. Prices are converted automatically.",
  "currency.infoTitle": "How it works",
  "currency.infoDescription": "When customers visit your store, their currency is auto-detected via Geo-IP. They can also manually switch currencies using the selector in the header. Prices are converted in real-time using built-in exchange rates (no external API required).",
  "currency.toast.saved": "Currency settings saved successfully",
  "currency.toast.failed": "Failed to save currency settings",

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
  "store.currency": "Currency",
  "store.notFoundTitle": "Store Not Found",
  "store.notFoundSubtitle": "The store you're looking for doesn't exist.",
  "store.goHome": "Go Home",
  "store.poweredBy": "Powered by StoreHub",
  "store.wishlistTitle": "Wishlist ({count})",
  "store.recentlyViewedTitle": "Recently Viewed ({count})",
  "store.addToWishlist": "Add to Wishlist",
  "store.removeFromWishlist": "Remove from Wishlist",
  "store.wishlistEmpty": "Your wishlist is empty",
  "store.addAllToCart": "Add All to Cart",
  "store.recentlyViewedEmpty": "No recently viewed products",
  "store.viewProduct": "View Product",

  // AI shopping assistant
  "assistant.trigger": "Shopping Assistant",
  "assistant.title": "AI Shopping Assistant",
  "assistant.greeting":
    "Hi! I'm the shopping assistant for this store. Ask me about any product, tell me your budget (for example \"under 600 EGP\"), or ask me to pick something for you.",
  "assistant.placeholder": "Ask about products...",
  "assistant.send": "Send message",
  "assistant.thinking": "Searching the store for you...",
  "assistant.error":
    "I couldn't reach the store right now. Please check your connection and try again.",
  "assistant.chipBestSellers": "Show best sellers",
  "assistant.chipBudget": "Products under 500 EGP",
  "assistant.chipSuggest": "Suggest your best pick",
  "assistant.picks": "Picked for you",

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
  "checkout.trackOrder": "Track Your Order",
  "checkout.sendWhatsApp": "Send Order via WhatsApp",
  "checkout.whatsappHint":
    "Send the full order details straight to the store on WhatsApp",
  "checkout.whatsappMissing":
    "This store hasn't added a WhatsApp number yet. Update it in Settings.",
  "checkout.failed": "Checkout failed",
  "checkout.email": "Email",
  "checkout.emailPlaceholder": "you@example.com",
  "checkout.manualSuccessTitle": "Order Received!",
  "checkout.manualSuccessSubtitle":
    "Your order was placed. Follow the payment instructions below to complete it.",
  "checkout.payment.method": "Payment Method",
  "checkout.payment.stripe": "Credit / Debit Card",
  "checkout.payment.stripeDesc": "Pay securely with your card via Stripe",
  "checkout.payment.stripeDisabled": "Card payments are not enabled for this store",
  "checkout.payment.paddle": "Mobile Wallet",
  "checkout.payment.paddleDesc": "Pay with Vodafone Cash or mobile wallets via Paddle",
  "checkout.payment.paddleDisabled": "Mobile wallet payments are not enabled for this store",
  "checkout.payment.manual": "Manual Payment",
  "checkout.payment.manualDesc": "Transfer or cash on delivery — instructions after ordering",
  "checkout.payment.instructions": "Payment Instructions",

  // Payment Settings
  "payment.stripe.title": "Stripe",
  "payment.stripe.subtitle": "Accept credit and debit card payments",
  "payment.stripe.enable": "Enable Stripe",
  "payment.stripe.enableHint": "Customers can pay with Visa, Mastercard and more",
  "payment.stripe.connected": "Stripe account connected successfully",
  "payment.stripe.connectFailed": "Failed to connect Stripe account",
  "payment.stripe.connectedStatus": "Connected",
  "payment.stripe.notConnected": "Not connected",
  "payment.stripe.readyToAccept": "Ready to accept payments",
  "payment.stripe.connectRequired": "Connect your Stripe account to start accepting payments",
  "payment.stripe.testConnection": "Test Connection",
  "payment.stripe.testSuccess": "Stripe connection test succeeded",
  "payment.stripe.testFailed": "Stripe connection test failed",
  "payment.stripe.connectAccount": "Connect Account",
  "payment.stripe.accountId": "Account ID",
  "payment.stripe.apiKeys": "API Keys",
  "payment.stripe.apiKeysHint":
    "Find these in your Stripe Dashboard under Developers → API keys",
  "payment.stripe.publishableKey": "Publishable Key",
  "payment.stripe.secretKey": "Secret Key",
  "payment.stripe.webhookSecret": "Webhook Signing Secret",
  "payment.stripe.webhookSecretHint": "From your Stripe webhook endpoint settings",
  "payment.paddle.title": "Paddle",
  "payment.paddle.subtitle": "Accept mobile wallet and regional payments",
  "payment.paddle.enable": "Enable Paddle",
  "payment.paddle.enableHint": "Accept Vodafone Cash and other local payment methods",
  "payment.paddle.vendorId": "Vendor ID",
  "payment.paddle.authCode": "Auth Code",
  "payment.paddle.webhookSecret": "Webhook Secret",
  "payment.manual.title": "Manual Payment",
  "payment.manual.subtitle": "Bank transfer, wallet numbers and cash on delivery",
  "payment.manual.enable": "Enable Manual Payment",
  "payment.manual.enableHint": "Show manual payment instructions at checkout",
  "payment.manual.vodafoneCash": "Vodafone Cash Number",
  "payment.manual.instaPay": "InstaPay Number",
  "payment.manual.cashOnDelivery": "Cash on Delivery",
  "payment.manual.cashOnDeliveryHint": "Let customers pay when they receive their order",
  "payment.manual.instructions": "Payment Instructions",
  "payment.manual.instructionsPlaceholder":
    "Transfer to account number 1234567890 — CIB Bank...",
  "payment.manual.instructionsHint": "Shown to the customer after placing an order",
  "payment.toast.saved": "Payment settings saved",
  "payment.toast.failed": "Failed to save payment settings",

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
  "aiRadar.abandonedCartsValue": "Total Abandoned Carts Value",
  "aiRadar.recoveredRevenue": "Recovered Revenue",
  "aiRadar.totalPendingCOD": "Total Pending COD Orders",
  "aiRadar.highRiskCount": "High Risk Count",
  "aiRadar.mediumRiskCount": "Medium Risk Count",
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
  "nav.shipping": "الشحن والبوالص",
  "nav.customers": "العملاء",
  "nav.analytics": "التحليلات",
  "nav.billing": "الاشتراك",
  "nav.settings": "الإعدادات",
  "nav.aiRadar": "رادار الذكاء الاصطناعي",
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
  "table.address": "العنوان",
  "table.risk": "المخاطر",
  "table.orders": "الطلبات",
  "table.totalSpent": "إجمالي الإنفاق",
  "table.lastOrder": "آخر طلب",

  // Statuses
  "status.Pending": "معلق",
  "status.Confirmed": "مؤكد",
  "status.Preparing": "قيد التجهيز",
  "status.Ready": "جاهز",
  "status.Shipped": "مشحون",
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
  "marketing.platform.whatsapp": "واتساب",
  "marketing.platform.ad": "عنوان الإعلان",
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

  // Promotions & Flash Sales
  "nav.promotions": "العروض والخصومات",
  "promos.badge.hot": "HOT",
  "promos.subtitle": "أنشئ عروضًا محدودة الزمن وكوبونات خصم تزيد المبيعات",
  "promos.card.couponRevenue": "إيرادات الكوبونات",
  "promos.card.flashStatus": "حالة العرض اللحظي",
  "promos.card.noActive": "لا يوجد عرض لحظي حاليًا",
  "promos.card.topCodes": "الأكثر استخدامًا",
  "promos.card.noRedemptions": "لا توجد عمليات استخدام بعد",
  "promos.card.redemptionCount": "{count} طلب باستخدام كوبون",
  "promos.status.live": "مباشر",
  "promos.status.scheduled": "مجدول",
  "promos.status.ended": "منتهٍ",
  "promos.status.paused": "متوقف",
  "promos.builder.title": "منشئ العروض اللحظية",
  "promos.builder.subtitle": "جدول خصمًا مخصصًا مع شريط عد تنازلي مباشر",
  "promos.field.title": "عنوان الحملة *",
  "promos.field.titlePlaceholder": "مثال: عرض نهاية الأسبوع",
  "promos.field.discount": "نسبة الخصم (%) *",
  "promos.field.start": "يبدأ *",
  "promos.field.end": "ينتهي *",
  "promos.field.bannerText": "نص الشريط",
  "promos.field.bannerTextPlaceholder": "لفترة محدودة — حتى نفاد الكمية!",
  "promos.field.showBanner": "إظهار شريط العد التنازلي المباشر في المتجر",
  "promos.field.targets": "يطبق على",
  "promos.target.all": "كل المنتجات",
  "promos.target.products": "منتجات محددة",
  "promos.target.categories": "أقسام محددة",
  "promos.target.selectProducts": "اختر منتجًا واحدًا على الأقل",
  "promos.target.selectCategories": "اختر قسمًا واحدًا على الأقل",
  "promos.create": "إطلاق العرض اللحظي",
  "promos.creating": "جارٍ الإطلاق...",
  "promos.preview": "معاينة الشريط المباشر",
  "promos.preview.startsIn": "يبدأ خلال",
  "promos.preview.endsIn": "ينتهي خلال",
  "promos.list.title": "عروضك اللحظية",
  "promos.list.empty": "لا توجد عروض لحظية بعد — أنشئ أول عرض من الأعلى",
  "promos.list.deleteConfirm": "هل تريد حذف هذا العرض اللحظي؟",
  "promos.list.toggleLabel": "تفعيل العرض اللحظي",
  "promos.list.appliesToAll": "كل المنتجات",
  "promos.list.productsCount": "{count} منتجات",
  "promos.list.categoriesCount": "{count} أقسام",
  "promos.coupons.title": "مولّد أكواد الخصم",
  "promos.coupons.subtitle":
    "كود جديد بضغطة واحدة — حدّد الخصم والحد الأقصى وانتهاء الصلاحية",
  "promos.coupons.generate": "توليد كود",
  "promos.coupons.code": "الكود *",
  "promos.coupons.discount": "مبلغ الخصم *",
  "promos.coupons.minSpend": "الحد الأدنى للإنفاق",
  "promos.coupons.maxUses": "حد الاستخدام",
  "promos.coupons.expires": "تاريخ الانتهاء",
  "promos.coupons.neverExpires": "بدون انتهاء",
  "promos.coupons.create": "إنشاء الكوبون",
  "promos.coupons.creating": "جارٍ الإنشاء...",
  "promos.coupons.empty": "لا توجد كوبونات بعد",
  "promos.coupons.usage": "تم استخدام {used} من {max}",
  "promos.coupons.deleteConfirm": "هل تريد حذف هذا الكوبون؟",
  "promos.coupons.status.active": "نشط",
  "promos.coupons.status.expired": "منتهي",
  "promos.coupons.status.exhausted": "نفِذ",
  "promos.toast.created": "تم إطلاق العرض اللحظي",
  "promos.toast.createFailed": "فشل إطلاق العرض اللحظي",
  "promos.toast.updated": "تم تحديث العرض اللحظي",
  "promos.toast.updateFailed": "فشل تحديث العرض اللحظي",
  "promos.toast.deleted": "تم حذف العرض اللحظي",
  "promos.toast.deleteFailed": "فشل حذف العرض اللحظي",
  "promos.toast.couponCreated": "تم إنشاء الكوبون",
  "promos.toast.couponCreateFailed": "فشل إنشاء الكوبون",
  "promos.toast.couponDeleted": "تم حذف الكوبون",
  "promos.toast.couponDeleteFailed": "فشل حذف الكوبون",
  "promos.error.titleRequired": "عنوان الحملة مطلوب",
  "promos.error.dates": "يجب أن يكون وقت الانتهاء بعد وقت البدء",
  "promos.error.discountRange": "يجب أن تكون نسبة الخصم بين 1 و100",
  "promos.error.selectTargets": "اختر منتجًا أو قسمًا واحدًا على الأقل",
  "promos.error.codeRequired": "كود الخصم مطلوب",
  "promos.error.positiveDiscount": "يجب أن يكون مبلغ الخصم أكبر من 0",

  // Storefront flash sale banner
  "store.flash.startsIn": "يبدأ خلال",
  "store.flash.endsIn": "ينتهي خلال",
  "store.flash.off": "خصم {percent}%",
  "store.flash.sale": "عرض لحظي",

  // Checkout coupon
  "checkout.coupon.title": "كود الخصم",
  "checkout.coupon.placeholder": "مثال: SAVE20-XYZ",
  "checkout.coupon.apply": "تطبيق",
  "checkout.coupon.applying": "جارٍ التحقق...",
  "checkout.coupon.applied": "تم تطبيق الكوبون",
  "checkout.coupon.remove": "إزالة",
  "checkout.coupon.discount": "خصم الكوبون",
  "checkout.coupon.failed": "تعذّر تطبيق الكوبون",
  "checkout.coupon.error.COUPON_NOT_FOUND": "كود الخصم غير موجود",
  "checkout.coupon.error.COUPON_EXPIRED": "كود الخصم منتهي الصلاحية",
  "checkout.coupon.error.COUPON_EXHAUSTED": "وصل كود الخصم لحد الاستخدام الأقصى",
  "checkout.coupon.error.MIN_SPEND_NOT_MET": "سلتك لا تحقق الحد الأدنى لهذا الكوبون",
  "aiRadar.abandonedCartsValue": "إجمالي قيمة العربات छोdعة",
  "aiRadar.recoveredRevenue": "إيرادات مُسترجعة متوقعة",
  "aiRadar.totalPendingCOD": "إجمالي طلبات COD المعلقة",
  "aiRadar.highRiskCount": "عدد المخاطر العالية",
  "aiRadar.mediumRiskCount": "عدد المخاطر المتوسطة",

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
  // Order tracking (customer-facing)
  "orders.title": "تتبع طلبك",
  "orders.searchTitle": "ابحث عن طلبك",
  "orders.searchBy": "البحث بواسطة",
  "orders.searchByOrderId": "رقم الطلب",
  "orders.searchByPhone": "رقم الهاتف",
  "orders.orderIdPlaceholder": "أدخل رقم طلبك",
  "orders.phonePlaceholder": "أدخل رقم هاتفك",
  "orders.search": "بحث",
  "orders.searching": "جارٍ البحث...",
  "orders.enterOrderIdOrPhone": "يرجى إدخال رقم الطلب أو رقم الهاتف",
  "orders.notFound": "الطلب غير موجود",
  "orders.searchFailed": "فشل في البحث عن الطلب",
  "orders.orderDetails": "الطلب رقم #{id}",
  "orders.customerInfo": "معلومات العميل",
  "orders.orderSummary": "ملخص الطلب",
  "orders.itemsCount": "العناصر",
  "orders.items": "عناصر الطلب",
  "orders.productRemoved": "تم حذف المنتج",
  "orders.quantity": "الكمية: {count}",
  "orders.canCancel": "يمكنك إلغاء هذا الطلب",
  "orders.canCancelDescription": "هذا الطلب لا يزال معلقًا ويمكن إلغاؤه. سيتم إعادة تخزين العناصر.",
  "orders.confirmCancel": "هل أنت متأكد من إلغاء هذا الطلب؟ لا يمكن التراجع عن هذا الإجراء.",
  "orders.cancelling": "جارٍ الإلغاء...",
  "orders.cancelOrder": "إلغاء الطلب",
  "orders.cancelFailed": "فشل إلغاء الطلب",
  "orders.status.pending": "معلق",
  "orders.status.confirmed": "مؤكد",
  "orders.status.preparing": "قيد التجهيز",
  "orders.status.ready": "جاهز",
  "orders.status.shipped": "مشحون",
  "orders.status.completed": "مكتمل",
  "orders.status.cancelled": "ملغي",
  "orders.continueShopping": "مواصلة التسوق",
  "orders.backToStore": "العودة للمتجر",
  "orders.subtitle": "تابع طلبك مباشرة وحمّل فاتورتك",
  "orders.invalidOrderId": "يرجى إدخال رقم طلب صحيح",
  "orders.invalidPhone": "يرجى إدخال رقم هاتف صحيح",
  "orders.notFoundTitle": "لم يتم العثور على الطلب",
  "orders.notFoundSubtitle":
    "لم نعثر على طلب بهذه البيانات. تحقق من رقم الطلب أو رقم الهاتف وحاول مرة أخرى.",
  "orders.notFoundAction": "البحث مرة أخرى",
  "orders.refresh": "تحديث الحالة",
  "orders.autoRefresh": "تتحدث الحالة تلقائيًا كل 30 ثانية",
  "orders.timeline.title": "حالة الطلب",
  "orders.timeline.received": "تم التلقي",
  "orders.timeline.receivedDesc": "تم استلام طلبك",
  "orders.timeline.processing": "جاري التحضير",
  "orders.timeline.processingDesc": "المتجر يجهّز طلبك حاليًا",
  "orders.timeline.shipped": "تم الشحن",
  "orders.timeline.shippedDesc": "طلبك في الطريق إليك",
  "orders.timeline.delivered": "تم التوصيل",
  "orders.timeline.deliveredDesc": "تم توصيل طلبك بنجاح",
  "orders.timeline.cancelled": "تم إلغاء الطلب",
  "orders.timeline.cancelledDesc": "تم إلغاء هذا الطلب ولن يتم توصيله.",
  "orders.invoice.title": "الفاتورة / الإيصال",
  "orders.invoice.open": "تحميل / طباعة الفاتورة",
  "orders.invoice.print": "طباعة / حفظ كـ PDF",
  "orders.invoice.billTo": "فاتورة إلى",
  "orders.invoice.invoiceNo": "رقم الفاتورة",
  "orders.invoice.date": "التاريخ",
  "orders.invoice.item": "الصنف",
  "orders.invoice.qty": "الكمية",
  "orders.invoice.unitPrice": "سعر الوحدة",
  "orders.invoice.subtotal": "المجموع الفرعي",
  "orders.invoice.shipping": "الشحن",
  "orders.invoice.tax": "الضريبة",
  "orders.invoice.total": "الإجمالي",
  "orders.invoice.free": "مجاني",
  "orders.invoice.included": "مشمولة",
  "orders.invoice.scanToVerify": "امسح ضوئيًا للتحقق من هذا الإيصال عبر الإنترنت",
  "orders.invoice.thankYou": "شكرًا لشرائك من متجرنا!",

  // Smart Shipping & Thermal Label Studio
  "shipping.subtitle": "إدارة مناطق الشحن وطباعة البوالص الحرارية وإرسال الطلبات",
  "shipping.tab.zones": "مناطق الشحن والأسعار",
  "shipping.tab.orders": "الطلبات الجاهزة للشحن",
  "shipping.badge.pending": "{count} طلب في انتظار التجهيز للشحن",
  "shipping.zones.title": "مناطق التوصيل",
  "shipping.zones.subtitle": "سعر التوصيل لكل منطقة — يُطبق عند إتمام الطلب",
  "shipping.zones.add": "إضافة منطقة",
  "shipping.zones.editing": "تعديل المنطقة",
  "shipping.zones.emptyTitle": "لا توجد مناطق شحن بعد",
  "shipping.zones.emptySubtitle": "أنشئ أول منطقة توصيل أو ابدأ من أحد القوالب الجاهزة بالأسفل",
  "shipping.zones.presets": "قوالب جاهزة",
  "shipping.zones.field.name": "اسم المنطقة *",
  "shipping.zones.field.namePlaceholder": "مثال: القاهرة",
  "shipping.zones.field.rate": "سعر الشحن (EGP) *",
  "shipping.zones.field.days": "مدة التوصيل (أيام)",
  "shipping.zones.active": "مفعّلة",
  "shipping.zones.inactive": "موقوفة",
  "shipping.zones.eta": "توصيل خلال {days} أيام",
  "shipping.zones.deleteConfirm": "هل تريد حذف منطقة التوصيل هذه؟",
  "shipping.zones.toast.created": "تم إنشاء منطقة التوصيل",
  "shipping.zones.toast.updated": "تم تحديث منطقة التوصيل",
  "shipping.zones.toast.deleted": "تم حذف منطقة التوصيل",
  "shipping.zones.toast.createFailed": "فشل إنشاء منطقة التوصيل",
  "shipping.zones.toast.updateFailed": "فشل تحديث منطقة التوصيل",
  "shipping.zones.toast.deleteFailed": "فشل حذف منطقة التوصيل",
  "shipping.zones.error.name": "اسم المنطقة مطلوب",
  "shipping.zones.error.rate": "أدخل سعر توصيل صحيحًا",
  "shipping.orders.emptyTitle": "كل الطلبات تم تجهيزها",
  "shipping.orders.emptySubtitle": "ستظهر هنا الطلبات الجديدة غير المشحونة جاهزة لطباعة بوالصها",
  "shipping.orders.selectAll": "تحديد الكل",
  "shipping.orders.selected": "{count} محدد",
  "shipping.orders.courier": "شركة الشحن",
  "shipping.orders.courierNone": "شركة الشحن (اختياري)",
  "shipping.orders.zone": "منطقة التوصيل",
  "shipping.orders.zoneNone": "بدون منطقة",
  "shipping.orders.zoneUnassigned": "غير محددة",
  "shipping.orders.tracking": "رقم التتبع",
  "shipping.orders.noTracking": "لا توجد بوليصة بعد",
  "shipping.orders.labelPrinted": "تمت طباعة البوليصة",
  "shipping.orders.fallbackStoreName": "متجري",
  "shipping.orders.cod": "الدفع عند الاستلام",
  "shipping.orders.itemsCount": "{count} منتجات",
  "shipping.orders.printLabels": "طباعة البوالص الحرارية",
  "shipping.orders.markShipped": "تحديد كمشحون",
  "shipping.orders.printing": "جارٍ تجهيز البوالص…",
  "shipping.orders.shipping": "جارٍ الشحن…",
  "shipping.orders.error.selectFirst": "حدد طلبًا واحدًا على الأقل أولًا",
  "shipping.orders.toast.labelsReady": "{count} بوليصة حرارية جاهزة",
  "shipping.orders.toast.labelsFailed": "فشل تجهيز البوالص الحرارية",
  "shipping.orders.toast.shipped": "تم تحديد {count} طلبات كمشحونة",
  "shipping.orders.toast.shipFailed": "فشل تحديد الطلبات كمشحونة",
  "shipping.orders.toast.zoneAssigned": "تم تحديد منطقة التوصيل",
  "shipping.orders.toast.zoneFailed": "فشل تحديد منطقة التوصيل",
  "shipping.orders.toast.markedPrinted": "تم تسجيل طباعة البوالص",
  "shipping.label.title": "استوديو البوالص الحرارية",
  "shipping.label.subtitle": "{count} بوليصة — اطبعها على ورق 4×6 أو 80 مم",
  "shipping.label.print": "طباعة البوالص",
  "shipping.label.from": "المرسل",
  "shipping.label.to": "إلى",
  "shipping.label.phone": "الهاتف",
  "shipping.label.zone": "المنطقة",
  "shipping.label.courier": "شركة الشحن",
  "shipping.label.tracking": "رقم التتبع",
  "shipping.label.order": "الطلب",
  "shipping.label.items": "المنتجات",
  "shipping.label.cod": "الدفع عند الاستلام",
  "shipping.label.codAmount": "حصّل {amount}",
  "shipping.label.codNote": "حصّل كامل المبلغ من العميل",
  "shipping.label.scan": "امسح لتتبع طلبك مباشرة",
  "shipping.label.paper4x6": "4×6 بوصة",
  "shipping.label.paper80": "إيصال 80 مم",
  "shipping.label.noZone": "منطقة غير محددة",

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
  // Theme settings
  "settings.themeSettingsTitle": "إعدادات theme",
  "settings.themeTemplate": "قالب_theme",
  "settings.primaryColor": "اللون الأساسي",
  "settings.colorHint": "اللون الستتي (مثال: #4f46e5)",
  "settings.secondaryColor": "اللون الثانوي",
  "settings.backgroundColor": "لون الخلفية",
  "settings.fontFamily": "خط الجسم",
  "settings.borderRadius": "زاوية الحدود",
  "settings.heroStyle": "خطوطHero",
  "settings.showAnnouncementBar": "عرض شريط الإعلان",
  "settings.announcementText": "نص الإعلان",
  "settings.announcementTextPlaceholder": "أدخل نص الإعلان",

  // Domain Settings
  "domain.title": "نطاق مخصص",
  "domain.subtitle": "اربط نطاقك الخاص بمتجرك (مثال: shop.yourbrand.com)",
  "domain.currentDomain": "النطاق الحالي",
  "domain.inputLabel": "أدخل نطاقك",
  "domain.inputPlaceholder": "shop.example.com",
  "domain.inputHint": "أدخل النطاق بدون http:// أو https://",
  "domain.add": "إضافة نطاق",
  "domain.remove": "إزالة النطاق",
  "domain.verifyNow": "التحقق من DNS",
  "domain.verified": "تم التحقق",
  "domain.status.active": "نشط ومحمي بـ SSL",
  "domain.status.pending": "بانتظار التحقق من DNS",
  "domain.status.notConfigured": "غير مُعد",
  "domain.dnsRecords": "سجلات DNS",
  "domain.dns.type": "النوع",
  "domain.dns.name": "الاسم",
  "domain.dns.value": "القيمة",
  "domain.dns.status": "الحالة",
  "domain.verification.pending": "بانتظار",
  "domain.verification.verified": "مُحقق",
  "domain.verification.failed": "فشل",
  "domain.dnsInstructions": "تعليمات إعداد DNS",
  "domain.dns.cname": "سجل CNAME",
  "domain.dns.aRecord": "سجل A (للنطاق الرئيسي)",
  "domain.dns.note": "قد تستغرق تغييرات DNS ما يصل إلى 48 ساعة للانتشار. بعد الإعداد، اضغط على 'التحقق من DNS' للتحقق من الحالة.",
  "domain.showInstructions": "إظهار تعليمات DNS",
  "domain.hideInstructions": "إخفاء تعليمات DNS",
  "domain.confirmRemove": "هل أنت متأكد من إزالة النطاق المخصص؟ سيعود متجرك إلى النطاق الفرعي الافتراضي storehub.app.",
  "domain.visitStore": "زيارة المتجر",
  "domain.copy": "نسخ",
  "domain.mockMode": "وضع تجريبي",
  "domain.toast.added": "تم إضافة النطاق المخصص بنجاح. قم بإعداد سجلات DNS والتحقق.",
  "domain.toast.addFailed": "فشل إضافة النطاق المخصص",
  "domain.toast.verified": "تم التحقق من النطاق بنجاح! يتم توفير شهادة SSL.",
  "domain.toast.notVerified": "سجلات DNS لم يتم التحقق منها بعد. يرجى التحقق من إعدادات DNS.",
  "domain.toast.verifyFailed": "فشل التحقق من النطاق",
  "domain.toast.removed": "تم إزالة النطاق المخصص بنجاح",
  "domain.toast.removeFailed": "فشل إزالة النطاق المخصص",
  "domain.toast.copied": "تم النسخ إلى الحافظة",

  // Currency Settings
  "currency.title": "إعدادات العملة",
  "currency.subtitle": "قم بتكوين العملة الأساسية لمتجرك والعملات المدعومة للعملاء الدوليين",
  "currency.baseCurrency": "العملة الأساسية",
  "currency.baseCurrencyHint": "العملة الأساسية لمتجرك. يتم تخزين جميع أسعار المنتجات بهذه العملة.",
  "currency.supportedCurrencies": "العملات المدعومة",
  "currency.supportedCurrenciesHint": "فعّل العملات الإضافية التي يمكن لعملائك استخدامها لعرض الأسعار. يتم تحويل الأسعار تلقائياً.",
  "currency.infoTitle": "كيف يعمل",
  "currency.infoDescription": "عند زيارة العملاء لمتجرك، يتم اكتشاف عملتهم تلقائياً عبر Geo-IP. يمكنهم أيضاً تبديل العملات يدوياً باستخدام أداة التبديل في الهيدر. يتم تحويل الأسعار في الوقت الفعلي باستخدام أسعار الصرف المضمنة (لا يلزم API خارجي).",
  "currency.toast.saved": "تم حفظ إعدادات العملة بنجاح",
  "currency.toast.failed": "فشل حفظ إعدادات العملة",

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
  "store.currency": "العملة",
  "store.notFoundTitle": "المتجر غير موجود",
  "store.notFoundSubtitle": "المتجر الذي تبحث عنه غير موجود.",
  "store.goHome": "الانتقال للرئيسية",
  "store.poweredBy": "مدعوم بواسطة StoreHub",
  "store.wishlistTitle": "قائمة الأمنيات ({count})",
  "store.recentlyViewedTitle": "شوهدت مؤخرًا ({count})",
  "store.addToWishlist": "أضف إلى الأمنيات",
  "store.removeFromWishlist": "أزل من الأمنيات",
  "store.wishlistEmpty": "قائمة الأمنيات فارغة",
  "store.addAllToCart": "أضف الكل للسلة",
  "store.recentlyViewedEmpty": "لا توجد منتجات مشاهدة مؤخرًا",
  "store.viewProduct": "عرض المنتج",

  // AI shopping assistant
  "assistant.trigger": "مساعد التسوق",
  "assistant.title": "مساعد التسوق الذكي",
  "assistant.greeting":
    "مرحبًا بك! أنا مساعد التسوق في هذا المتجر — اسألني عن أي منتج، أو أخبرني بميزانيتك مثل \"أقل من 600 جنيه\"، أو اطلب مني ترشيحًا.",
  "assistant.placeholder": "اسأل عن المنتجات...",
  "assistant.send": "إرسال",
  "assistant.thinking": "جارٍ البحث في المتجر...",
  "assistant.error":
    "تعذّر الوصول إلى المتجر حاليًا. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.",
  "assistant.chipBestSellers": "عرض المنتجات الأكثر مبيعاً",
  "assistant.chipBudget": "منتجات أقل من 500 EGP",
  "assistant.chipSuggest": "اقترح لي أفضل منتج",
  "assistant.picks": "اقتراحات لك",

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
  "checkout.trackOrder": "تتبع طلبك",
  "checkout.sendWhatsApp": "إرسال الطلب عبر واتساب",
  "checkout.whatsappHint": "شارك تفاصيل طلبك كاملة مع المتجر مباشرة على واتساب",
  "checkout.whatsappMissing":
    "لم يضف صاحب المتجر رقم واتساب بعد. يمكنك تحديثه من الإعدادات.",
  "checkout.failed": "تعذّر إتمام الطلب",
  "checkout.email": "البريد الإلكتروني",
  "checkout.emailPlaceholder": "you@example.com",
  "checkout.manualSuccessTitle": "تم استلام الطلب!",
  "checkout.manualSuccessSubtitle":
    "تم تسجيل طلبك. اتبع تعليمات الدفع أدناه لإتمامه.",
  "checkout.payment.method": "طريقة الدفع",
  "checkout.payment.stripe": "بطاقة ائتمان / خصم",
  "checkout.payment.stripeDesc": "ادفع بأمان ببطاقتك عبر Stripe",
  "checkout.payment.stripeDisabled": "مدفوعات البطاقات غير مفعّلة لهذا المتجر",
  "checkout.payment.paddle": "محفظة إلكترونية",
  "checkout.payment.paddleDesc": "ادفع بفودافون كاش أو المحافظ الإلكترونية عبر Paddle",
  "checkout.payment.paddleDisabled": "مدفوعات المحافظ الإلكترونية غير مفعّلة لهذا المتجر",
  "checkout.payment.manual": "دفع يدوي",
  "checkout.payment.manualDesc": "حوالة أو الدفع عند الاستلام — التعليمات بعد الطلب",
  "checkout.payment.instructions": "تعليمات الدفع",

  // Payment Settings
  "payment.stripe.title": "سترايب (Stripe)",
  "payment.stripe.subtitle": "قبول مدفوعات البطاقات الائتمانية والخصومية",
  "payment.stripe.enable": "تفعيل Stripe",
  "payment.stripe.enableHint": "سيتمكن العملاء من الدفع بفيزا وماستركارد وغيرها",
  "payment.stripe.connected": "تم ربط حساب Stripe بنجاح",
  "payment.stripe.connectFailed": "فشل ربط حساب Stripe",
  "payment.stripe.connectedStatus": "متصل",
  "payment.stripe.notConnected": "غير متصل",
  "payment.stripe.readyToAccept": "جاهز لاستقبال المدفوعات",
  "payment.stripe.connectRequired": "اربط حساب Stripe لبدء استقبال المدفوعات",
  "payment.stripe.testConnection": "اختبار الاتصال",
  "payment.stripe.testSuccess": "نجح اختبار اتصال Stripe",
  "payment.stripe.testFailed": "فشل اختبار اتصال Stripe",
  "payment.stripe.connectAccount": "ربط الحساب",
  "payment.stripe.accountId": "معرف الحساب",
  "payment.stripe.apiKeys": "مفاتيح API",
  "payment.stripe.apiKeysHint":
    "تجدها في لوحة تحكم Stripe تحت المطوّرين ← مفاتيح API",
  "payment.stripe.publishableKey": "المفتاح العام",
  "payment.stripe.secretKey": "المفتاح السري",
  "payment.stripe.webhookSecret": "سر توقيع Webhook",
  "payment.stripe.webhookSecretHint": "من إعدادات نقطة Webhook في Stripe",
  "payment.paddle.title": "Paddle",
  "payment.paddle.subtitle": "قبول المدفوعات بالمحافظ الإلكترونية والمحلية",
  "payment.paddle.enable": "تفعيل Paddle",
  "payment.paddle.enableHint": "قبول فودافون كاش وطرق الدفع المحلية الأخرى",
  "payment.paddle.vendorId": "معرف البائع",
  "payment.paddle.authCode": "رمز التفويض",
  "payment.paddle.webhookSecret": "سر Webhook",
  "payment.manual.title": "دفع يدوي",
  "payment.manual.subtitle": "تحويل بنكي وأرقام محافظ والدفع عند الاستلام",
  "payment.manual.enable": "تفعيل الدفع اليدوي",
  "payment.manual.enableHint": "إظهار تعليمات الدفع اليدوي عند إتمام الطلب",
  "payment.manual.vodafoneCash": "رقم فودافون كاش",
  "payment.manual.instaPay": "رقم InstaPay",
  "payment.manual.cashOnDelivery": "الدفع عند الاستلام",
  "payment.manual.cashOnDeliveryHint": "ادفع العميل عند استلام طلبه",
  "payment.manual.instructions": "تعليمات الدفع",
  "payment.manual.instructionsPlaceholder":
    "حوّل على رقم الحساب 1234567890 — بنك CIB...",
  "payment.manual.instructionsHint": "تظهر للعميل بعد تأكيد الطلب",
  "payment.toast.saved": "تم حفظ إعدادات الدفع",
  "payment.toast.failed": "فشل حفظ إعدادات الدفع",

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

function readCookieLocale(): Locale | null {
  if (typeof document === "undefined") return null;
  try {
    const match = document.cookie
      .split("; ")
      .find((part) => part.startsWith(`${LOCALE_STORAGE_KEY}=`));
    const value = match ? decodeURIComponent(match.split("=")[1]) : null;
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

export function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // Ignore storage errors and fall through to the cookie.
  }
  return readCookieLocale() ?? DEFAULT_LOCALE;
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
  initialLocale = DEFAULT_LOCALE,
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
