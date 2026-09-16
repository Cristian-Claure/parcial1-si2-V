import { Link } from "react-router-dom";
import { ProductCard } from "../../../shared/ui/ProductCard";

interface FeaturedProduct {
  id: string;
  slug: string;
  name: string;
  categoryName?: string;
  images: {
    imageUrl?: string;
    altText?: string | null;
  }[];
  variants: {
    price: number;
  }[];
}

interface FeaturedProductsProps {
  products: FeaturedProduct[];
}

export function FeaturedProducts({
  products,
}: FeaturedProductsProps) {
  if (products.length === 0) {
    return null;
  }

  return (
    <section className="section">
      <div className="product-grid">
        {products.map((product) => (
          <Link
            key={product.id}
            to={`/catalogo/${product.slug}`}
          >
            <ProductCard
              name={product.name}
              category={product.categoryName}
              image={product.images[0]?.imageUrl}
              price={`${Math.min(
                ...product.variants.map((variant) => variant.price),
              ).toFixed(2)} BOB`}
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
