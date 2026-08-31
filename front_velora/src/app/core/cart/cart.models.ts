export type CartStatus =
  | 'ACTIVE'
  | 'CONVERTED'
  | 'ABANDONED';

export interface CartItem {
  id: string;
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  size: string;
  color: string;
  colorHex: string | null;
  unitPrice: number;
  currency: string;
  quantity: number;
  subtotal: number;
}

export interface Cart {
  id: string | null;
  status: CartStatus;
  items: CartItem[];
  totalItems: number;
  subtotal: number;
  currency: string;
}

export interface AddCartItemPayload {
  variantId: string;
  quantity: number;
}

export interface UpdateCartItemPayload {
  quantity: number;
}

export const EMPTY_CART: Cart = {
  id: null,
  status: 'ACTIVE',
  items: [],
  totalItems: 0,
  subtotal: 0,
  currency: 'BOB'
};