interface HeroSectionProps {
  title: string;
  description: string;
}

export function HeroSection({
  title,
  description,
}: HeroSectionProps) {
  return (
    <section className="hero-section velora-motion">
      <div className="hero-copy">
        <span className="eyebrow">
          NUEVA COLECCIÃ“N Â· 2026
        </span>

        <h1>{title}</h1>

        <p>{description}</p>
      </div>
    </section>
  );
}
