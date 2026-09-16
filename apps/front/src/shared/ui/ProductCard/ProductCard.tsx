export interface ProductCardProduct {
  id?: string;
  name: string;
  price: string;
  image?: string;
  category?: string;
}

interface ProductCardProps {
  product?: ProductCardProduct;

  // Backward compatibility during migration
  name?: string;
  price?: string;
  image?: string;
  category?: string;

  showFavorite?: boolean;
}

export function ProductCard({
  product,
  name,
  price,
  image,
  category,
  showFavorite = true,
}: ProductCardProps) {
  const item: ProductCardProduct = product ?? {
    name: name ?? "",
    price: price ?? "",
    image,
    category,
  };

  return (
    <article className="product-card">
      {item.image ? (
        <img
          src={item.image}
          alt={item.name}
        />
      ) : null}

      {item.category ? (
        <small>{item.category}</small>
      ) : null}

      <h3>{item.name}</h3>
      <strong>{item.price}</strong>

      {showFavorite ? (
        <button
          type="button"
          aria-label={`Favorito ${item.name}`}
        >
          â™¡
        </button>
      ) : null}
    </article>
  );
}
