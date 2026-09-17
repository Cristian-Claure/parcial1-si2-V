import mark from "../../assets/brand/logo-mark.png";

type BrandVariant = "mark" | "wordmark" | "lockup";

interface BrandProps {
  variant: BrandVariant;
  showTagline?: boolean;
  className?: string;
}

export function Brand({
  variant,
  showTagline = false,
  className,
}: BrandProps) {
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
