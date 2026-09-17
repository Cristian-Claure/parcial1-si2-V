import { useEffect, useState, type ReactNode } from "react";

import hero1 from "../../../assets/hero/VELORA1.png";
import hero5 from "../../../assets/hero/VELORA5.png";
import hero8 from "../../../assets/hero/VELORA8.png";

// Panoramic lifestyle shots; each has brand text burned in on a different
// side, so the crop that keeps the models in frame differs per image.
const SLIDES = [
  { src: hero1, position: "78% 38%" },
  { src: hero5, position: "28% 35%" },
  { src: hero8, position: "35% 35%" },
];

const AUTOPLAY_MS = 5500;

export function HeroCarousel({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActive((current) => (current + 1) % SLIDES.length);
    }, AUTOPLAY_MS);

    return () => clearInterval(interval);
  }, []);

  return (
    <section className="hero-section">
      {SLIDES.map((slide, index) => (
        <img
          key={slide.src}
          src={slide.src}
          alt=""
          className={index === active ? "hero-slide active" : "hero-slide"}
          style={{ objectPosition: slide.position }}
        />
      ))}

      <div className="hero-scrim" />

      <div className="hero-copy">{children}</div>

      <div className="hero-dots">
        {SLIDES.map((slide, index) => (
          <button
            key={slide.src}
            type="button"
            className={index === active ? "hero-dot active" : "hero-dot"}
            aria-label={`Ir a la imagen ${index + 1}`}
            onClick={() => setActive(index)}
          />
        ))}
      </div>
    </section>
  );
}
