interface HeroProps {
  title: string;
  description: string;
  children?: React.ReactNode;
}

export function Hero({
  title,
  description,
  children,
}: HeroProps) {
  return (
    <section className="velora-hero">
      <div>
        <span>NUEVA COLECCIÃ“N Â· 2026</span>
        <h1>{title}</h1>
        <p>{description}</p>
        {children}
      </div>
    </section>
  );
}
