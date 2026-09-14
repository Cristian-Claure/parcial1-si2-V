import logo from "@/assets/brand/velora-logo.svg";
import symbol from "@/assets/brand/velora-symbol.svg";

type BrandVariant = "logo" | "symbol";

interface BrandProps {
  variant?: BrandVariant;
  className?: string;
}

export function Brand({
  variant = "logo",
  className,
}: BrandProps) {
  return (
    <img
      className={className}
      src={variant === "logo" ? logo : symbol}
      alt="VÃ‰LORA"
    />
  );
}
