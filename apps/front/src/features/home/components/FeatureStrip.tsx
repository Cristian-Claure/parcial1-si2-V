interface FeatureItem {
  title: string;
  description: string;
}

export function FeatureStrip({
  items,
}: {
  items: FeatureItem[];
}) {
  return (
    <section className="feature-strip">
      {items.map((item) => (
        <article key={item.title}>
          <h3>{item.title}</h3>
          <p>{item.description}</p>
        </article>
      ))}
    </section>
  );
}
