import { z } from "zod";
import { companyIdSchema } from "./companies.js";

export const cartStatusSchema = z.enum(["ACTIVE", "CONVERTED", "ABANDONED"]);
export type CartStatus = z.infer<typeof cartStatusSchema>;

export const addCartItemRequestSchema = z.object({
  companyId: companyIdSchema,
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1, "La cantidad mínima es 1.").max(99, "La cantidad máxima por producto es 99."),
});
export type AddCartItemRequest = z.infer<typeof addCartItemRequestSchema>;

export const updateCartItemRequestSchema = z.object({
  quantity: z.number().int().min(1, "La cantidad mínima es 1.").max(99, "La cantidad máxima por producto es 99."),
});
export type UpdateCartItemRequest = z.infer<typeof updateCartItemRequestSchema>;

export const cartItemResponseSchema = z.object({
  id: z.string().uuid(), variantId: z.string().uuid(), productId: z.string().uuid(), productName: z.string(), sku: z.string(), size: z.string(), color: z.string(), colorHex: z.string().nullable(), unitPrice: z.number().nonnegative(), currency: z.string(), quantity: z.number().int().positive(), subtotal: z.number().nonnegative(),
});
export type CartItemResponse = z.infer<typeof cartItemResponseSchema>;

export const cartResponseSchema = z.object({
  id: z.string().uuid().nullable(), status: cartStatusSchema, items: z.array(cartItemResponseSchema), totalItems: z.number().int().nonnegative(), subtotal: z.number().nonnegative(), currency: z.string(),
});
export type CartResponse = z.infer<typeof cartResponseSchema>;
