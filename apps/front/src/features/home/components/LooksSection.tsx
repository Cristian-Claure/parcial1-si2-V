import type { ReactNode } from "react";

import { Link } from "react-router-dom";

import look2 from "../../../assets/hero/VELORA2.png";
import look3 from "../../../assets/hero/VELORA3.png";
import look4 from "../../../assets/hero/VELORA4.png";
import look6 from "../../../assets/hero/VELORA6.png";
import look7 from "../../../assets/hero/VELORA7.png";
import look9 from "../../../assets/hero/VELORA9.png";
import look10 from "../../../assets/hero/VELORA10.png";

// Editorial full-look shots; the burned-in phrase is reproduced as real
// text over a bottom scrim instead of relying on the baked-in wordmark,
// since on most of these it sits right next to (or on top of) the phrase.
const LOOKS: {
  src: string;
  position: string;
  phrase: ReactNode;
}[] = [
  { src: look2, position: "50% 28%", phrase: <>Power dressing, <em>softly redefined.</em></> },
  { src: look3, position: "45% 32%", phrase: "Lino, luz y elegancia diaria." },
  { src: look4, position: "28% 35%", phrase: <>Tejidos que abrazan <em>tu estilo.</em></> },
  { src: look6, position: "32% 30%", phrase: "Confianza que se viste." },
  { src: look7, position: "28% 40%", phrase: "Los detalles cuentan." },
  { src: look9, position: "72% 35%", phrase: <>Casual, pero <em>impecable.</em></> },
  { src: look10, position: "72% 40%", phrase: "Más que moda, es tu historia." },
];

export function LooksSection() {
  return (
    <section className="section looks-section">
      <div className="section-heading">
        <span className="eyebrow">EDITORIAL</span>
        <h2>Looks completos</h2>
      </div>

      <div className="looks-grid">
        {LOOKS.map((look) => (
          <Link className="look-card" to="/catalogo" key={look.src}>
            <img src={look.src} alt="" style={{ objectPosition: look.position }} />
            <div className="look-scrim" />
            <p className="look-phrase">{look.phrase}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
