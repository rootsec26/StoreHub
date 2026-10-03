import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { orders, orderItems, products, stores } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";

const PAYMENT_METHODS = ["cash", "card"] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];
type DiscountType = "percent" | "fixed";

interface PosSaleItemInput {
  productId: string;
  quantity: number;
}

interface PosSaleBody {
  items?: PosSaleItemInput[];
  discountType?: DiscountType;
  discountValue?: number;
  taxRate?: number;
  paymentMethod?: string;
}

/** Business error that must roll back the transaction and reach the client. */
class PosSaleError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "PosSaleError";
    this.status = status;
    this.code = code;
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Smart POS checkout: books a walk-in sale as `channel: "pos"` /
 * `payment_status: "paid"` and decrements stock for every sold unit.
 *
 * Pricing is recomputed server-side from the catalog so a tampered client
 * payload can never change what gets charged, and the stock guard runs inside
 * the same transaction as the order insert (overselling rolls the sale back).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userStore = await db
      .select()
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);

    if (userStore.length === 0) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }
    const store = userStore[0];

    const body = (await request.json()) as PosSaleBody;
    const rawItems = Array.isArray(body.items) ? body.items : [];

    if (rawItems.length === 0) {
      return NextResponse.json(
        { error: "At least one item is required", code: "EMPTY_CART" },
        { status: 400 }
      );
    }

    const paymentMethod: PaymentMethod =
      body.paymentMethod === "card" ? "card" : "cash";
    const discountType: DiscountType =
      body.discountType === "fixed" ? "fixed" : "percent";
    const discountValue = Number.isFinite(Number(body.discountValue))
      ? Math.max(Number(body.discountValue), 0)
      : 0;
    const taxRate = Number.isFinite(Number(body.taxRate))
      ? clamp(Number(body.taxRate), 0, 100)
      : 0;

    // Merge duplicate lines so stock is decremented once per product.
    const quantities = new Map<string, number>();
    for (const item of rawItems) {
      const productId = typeof item?.productId === "string" ? item.productId : "";
      const quantity = Math.floor(Number(item?.quantity));
      if (!productId || !Number.isFinite(quantity) || quantity <= 0) {
        return NextResponse.json(
          { error: "Every line needs a product and a positive quantity", code: "INVALID_ITEM" },
          { status: 400 }
        );
      }
      quantities.set(productId, (quantities.get(productId) ?? 0) + quantity);
    }

    const productIds = Array.from(quantities.keys());
    const catalog = await db
      .select()
      .from(products)
      .where(and(inArray(products.id, productIds), eq(products.storeId, store.id)));

    if (catalog.length !== productIds.length) {
      return NextResponse.json(
        { error: "One or more products are not available in this store", code: "PRODUCT_NOT_FOUND" },
        { status: 404 }
      );
    }

    const lines = catalog.map((product) => {
      const quantity = quantities.get(product.id) ?? 0;
      const unitPrice = round2(parseFloat(product.price) || 0);
      return {
        productId: product.id,
        name: product.name,
        quantity,
        unitPrice,
        lineTotal: round2(unitPrice * quantity),
        stock: product.stock,
      };
    });

    for (const line of lines) {
      if (line.stock < line.quantity) {
        return NextResponse.json(
          {
            error: `Insufficient stock for ${line.name}`,
            code: "INSUFFICIENT_STOCK",
            productId: line.productId,
            available: line.stock,
          },
          { status: 409 }
        );
      }
    }

    const subtotal = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));
    const discountAmount =
      discountType === "percent"
        ? round2((subtotal * clamp(discountValue, 0, 100)) / 100)
        : round2(Math.min(discountValue, subtotal));
    const taxable = round2(subtotal - discountAmount);
    const taxAmount = round2((taxable * taxRate) / 100);
    const total = round2(taxable + taxAmount);

    const order = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(orders)
        .values({
          storeId: store.id,
          customerName: "Walk-in Customer",
          customerPhone: "",
          customerAddress: "",
          notes: "",
          totalAmount: String(total.toFixed(2)),
          discountAmount: String(discountAmount.toFixed(2)),
          status: "Completed",
          channel: "pos",
          paymentStatus: "paid",
          paymentMethod,
        })
        .returning();

      const order = inserted[0];

      await tx.insert(orderItems).values(
        lines.map((line) => ({
          orderId: order.id,
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: String(line.unitPrice.toFixed(2)),
        }))
      );

      // Atomic guarded decrement: fails (and rolls the whole sale back)
      // when another register sold the last units in the meantime.
      for (const line of lines) {
        const updated = await tx
          .update(products)
          .set({ stock: sql`${products.stock} - ${line.quantity}` })
          .where(
            and(
              eq(products.id, line.productId),
              eq(products.storeId, store.id),
              gte(products.stock, line.quantity)
            )
          )
          .returning({ id: products.id });

        if (updated.length === 0) {
          throw new PosSaleError(
            409,
            "INSUFFICIENT_STOCK",
            `Insufficient stock for ${line.name}`
          );
        }
      }

      return order;
    });

    return NextResponse.json({
      order,
      sale: {
        orderId: order.id,
        receiptNumber: order.id.slice(0, 8).toUpperCase(),
        store: {
          name: store.name,
          logoUrl: store.logoUrl || "",
          phone: store.phone || "",
          address: store.address || "",
        },
        cashierName: session.name || session.email || "",
        createdAt: order.createdAt,
        items: lines.map((line) => ({
          productId: line.productId,
          name: line.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
        })),
        subtotal,
        discountAmount,
        discountType,
        discountValue,
        taxRate,
        taxAmount,
        total,
        paymentMethod,
        channel: "pos",
        paymentStatus: "paid",
      },
    });
  } catch (error) {
    if (error instanceof PosSaleError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Create POS sale error:", error);
    return createErrorResponse(error, "Failed to complete the POS sale");
  }
}
