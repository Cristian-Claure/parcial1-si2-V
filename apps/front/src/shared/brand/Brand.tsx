import type { CompanyBrand } from "@velora/contracts";
import mark from "../../assets/brand/logo-mark.png";

type BrandVariant = "mark" | "wordmark" | "lockup";

interface BrandProps {
  variant: BrandVariant;
  showTagline?: boolean;
  className?: string;
  /** Empresa activa; sin ella (o si es VÉLORA) se muestra la marca de la plataforma. */
  brand?: CompanyBrand | null;
}

function TenantMark({ brand }: { brand: CompanyBrand }) {
  return brand.logoUrl ? <img className="tenant-logo" src={brand.logoUrl} alt={brand.name} /> : <span className="tenant-monogram" aria-hidden="true">{brand.name.slice(0, 1).toUpperCase()}</span>;
}

export function Brand({
  variant,
  showTagline = false,
  className,
  brand,
}: BrandProps) {
  if (brand && !brand.isPlatformBrand) {
    if (variant === "mark") return <span className={["brand-mark-badge", className].filter(Boolean).join(" ")} title={brand.name}><TenantMark brand={brand} /></span>;
    if (variant === "wordmark") return <span className={["brand-wordmark", className].filter(Boolean).join(" ")}>{brand.name}</span>;
    return <span className={["brand-lockup", className].filter(Boolean).join(" ")}><TenantMark brand={brand} /><span className="brand-lockup-text"><span className="brand-wordmark">{brand.name}</span>{showTagline && brand.tagline ? <span className="brand-tagline">{brand.tagline}</span> : null}</span></span>;
  }

  if (variant === "mark") {
    return (
      <span className={["brand-mark-badge", className].filter(Boolean).join(" ")}>
        <img src={mark} alt="VÉLORA" />
      </span>
    );
  }

  if (variant === "wordmark") {
    return (
      <span className={["brand-wordmark", className].filter(Boolean).join(" ")}>
        VÉLORA
      </span>
    );
  }

  return (
    <span className={["brand-lockup", className].filter(Boolean).join(" ")}>
      <img className="brand-lockup-mark" src={mark} alt="" />
      <span className="brand-lockup-text">
        <span className="brand-wordmark">VÉLORA</span>
        {showTagline ? <span className="brand-tagline">More than fashion</span> : null}
      </span>
    </span>
  );
}
