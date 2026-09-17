import type { ProductResponse } from "@velora/contracts";

export function primaryImage(product: ProductResponse): string | null {
  return product.images.find((image) => image.primary)?.imageUrl ?? product.images[0]?.imageUrl ?? null;
}
