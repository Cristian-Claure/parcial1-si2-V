export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE';

export type TryOnCategory =
  | 'TOP'
  | 'BOTTOM'
  | 'DRESS'
  | 'OUTERWEAR'
  | 'SHOES'
  | 'ACCESSORY';

export type ProductImagePurpose =
  | 'GALLERY'
  | 'TRY_ON_GARMENT';

export interface Category {
  id: string;
  parentId: string | null;
  parentName: string | null;
  name: string;
  slug: string;
  description: string | null;
  active: boolean;
}

export interface ProductVariant {
  id: string;
  sku: string;
  barcode: string | null;
  size: string;
  color: string;
  colorHex: string | null;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  active: boolean;
}

export interface ProductImage {
  id: string;
  variantId: string | null;
  imageUrl: string;
  altText: string | null;
  purpose: ProductImagePurpose;
  sortOrder: number;
  primary: boolean;
}

export interface Product {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  slug: string;
  description: string | null;
  brand: string | null;
  composition: string | null;
  careInstructions: string | null;
  fitNotes: string | null;
  status: ProductStatus;
  tryOnEnabled: boolean;
  tryOnCategory: TryOnCategory | null;
  tryOnReady: boolean;
  variants: ProductVariant[];
  images: ProductImage[];
}
