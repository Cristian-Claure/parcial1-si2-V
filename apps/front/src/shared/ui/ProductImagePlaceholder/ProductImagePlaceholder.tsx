export function ProductImagePlaceholder() {
  return (
    <svg
      className="product-image-placeholder"
      viewBox="0 0 64 64"
      role="img"
      aria-label="Sin imagen disponible"
    >
      <path d="M32 8a4 4 0 1 0-4 4" />
      <path d="M32 12v6" />
      <path d="M10 42 32 18 54 42" />
      <path d="M8 42h48" />
    </svg>
  );
}
