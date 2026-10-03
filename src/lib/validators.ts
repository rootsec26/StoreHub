import { z } from "zod";

export const checkoutItemSchema = z.object({
  productId: z.string().uuid("Invalid product ID"),
  quantity: z.number().int().positive("Quantity must be a positive integer"),
  unitPrice: z.number().nonnegative("Unit price must be non-negative"),
});

export const checkoutRequestSchema = z.object({
  storeId: z.string().uuid("Invalid store ID"),
  customerName: z.string().min(1, "Customer name is required").max(200),
  customerPhone: z.string().max(50).optional(),
  customerEmail: z.string().email("Invalid email format").max(200).optional().or(z.literal("")),
  customerAddress: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
  items: z.array(checkoutItemSchema).min(1, "At least one item is required"),
  paymentMethod: z.enum(["stripe", "paddle", "manual", "cod"]),
  currency: z.string().length(3, "Currency must be 3-letter ISO code"),
  successUrl: z.string().url("Invalid success URL").optional(),
  cancelUrl: z.string().url("Invalid cancel URL").optional(),
  redeemPoints: z.number().int().nonnegative().optional(),
  /** Language used for the automated WhatsApp COD verification message. */
  locale: z.enum(["en", "ar"]).optional(),
});

export const orderCreateSchema = z.object({
  storeId: z.string().uuid("Invalid store ID"),
  customerName: z.string().min(1, "Customer name is required").max(200),
  customerPhone: z.string().max(50).optional(),
  customerAddress: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
  items: z.array(
    z.object({
      productId: z.string().uuid("Invalid product ID"),
      quantity: z.number().int().positive("Quantity must be a positive integer"),
      unitPrice: z.number().nonnegative("Unit price must be non-negative"),
    })
  ).min(1, "At least one item is required"),
  /** Optional pay-later method so merchant-created COD orders are verified too. */
  paymentMethod: z.enum(["cod", "manual", "stripe", "paddle"]).optional(),
});

export const orderStatusUpdateSchema = z.object({
  id: z.string().uuid("Invalid order ID"),
  status: z.enum([
    "Pending",
    "Confirmed",
    "Preparing",
    "Ready",
    "Shipped",
    "Completed",
    "Cancelled",
  ]),
});

export const redeemCodeSchema = z.object({
  code: z.string().min(1, "Activation code is required").max(50).toUpperCase(),
});

export const loyaltyAdjustmentSchema = z.object({
  customerId: z.string().uuid("Invalid customer ID"),
  action: z.enum(["add", "deduct"]),
  points: z.number().int().positive("Points must be a positive integer").max(1000000),
  note: z.string().max(140).optional(),
});

export const couponValidateSchema = z.object({
  storeId: z.string().uuid("Invalid store ID"),
  code: z.string().min(1, "Coupon code is required").max(50).toUpperCase(),
  subtotal: z.number().nonnegative("Subtotal must be non-negative"),
});

export const activateAddonSchema = z.object({
  code: z.string().min(1, "Activation code is required").max(50).toUpperCase(),
  addOn: z.enum(["white_label", "staff_seats"]),
});

export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (!result.success) {
    return { success: false, error: result.error };
  }
  return { success: true, data: result.data };
}

export function formatZodError(error: z.ZodError<unknown>): string {
  // Zod v4 uses 'issues' instead of 'errors'
  const issues = (error as { issues?: z.ZodIssue[] }).issues ?? (error as { errors?: z.ZodIssue[] }).errors ?? [];
  return issues.map((e: z.ZodIssue) => `${e.path.join(".")}: ${e.message}`).join("; ");
}