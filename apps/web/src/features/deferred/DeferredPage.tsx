import { Link } from "react-router-dom";
export function DeferredPage({ phase, title, description }: { phase: "N8" | "N9" | "N10"; title: string; description: string }) {
  return <section className="page centered"><span className="eyebrow">MIGRACIÓN {phase}</span><h1>{title}</h1><p>{description}</p><div className="notice">Esta ruta se conserva para que la navegación React no produzca 404, pero su lógica no se duplica antes de migrar el backend correspondiente.</div><Link className="button secondary" to="..">Volver</Link></section>;
}
