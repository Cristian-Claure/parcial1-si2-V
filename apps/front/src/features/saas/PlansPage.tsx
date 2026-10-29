import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { veloraApi } from "../../core/api/veloraApi";
import { Notice } from "../../shared/feedback/Notice";
import { PLAN_ROWS, planHighlights, priceLabel } from "./planCopy";
import { PageSkeleton } from "../../shared/ui/Skeleton";

/** Comparación pública de planes (marca de la plataforma Trama). Los datos vienen de la tabla plans. */
export function PlansPage() {
  const plans = useQuery({ queryKey: ["plans"], queryFn: veloraApi.plans });
  if (plans.isLoading) return <PageSkeleton />;
  if (plans.isError || !plans.data) return <section className="page"><Notice kind="error">No se pudieron cargar los planes.</Notice></section>;
  const featured = plans.data[Math.floor(plans.data.length / 2)]?.code;
  return <section className="page platform-main">
    <div className="plans-hero"><span className="eyebrow">TRAMA PARA TU MARCA</span><h1>Tu tienda de moda, lista en minutos</h1><p>Catálogo, inventario, POS, pedidos en línea, probador virtual y reportes en una sola plataforma. Empieza gratis y crece cuando lo necesites.</p></div>
    <div className="plan-grid">{plans.data.map((plan) => <article key={plan.code} className={plan.code === featured ? "plan-card featured" : "plan-card"}>
      {plan.code === featured ? <span className="plan-ribbon">MÁS POPULAR</span> : null}
      <span className="eyebrow">{plan.code}</span><h2>{plan.name}</h2>
      <div className="plan-price">{priceLabel(plan)}{plan.priceMonthly > 0 ? <small>/ mes</small> : null}</div>
      <p>{plan.description}</p>
      <ul>{planHighlights(plan).map((line) => <li key={line}>{line}</li>)}</ul>
      <Link className={plan.code === featured ? "button primary full" : "button secondary full"} to={`/crear-tienda?plan=${plan.code}`}>Crear mi tienda</Link>
    </article>)}</div>
    <div className="panel plan-compare"><h2>Compara los planes</h2><div className="table-wrap"><table><thead><tr><th scope="col">Incluye</th>{plans.data.map((plan) => <th scope="col" key={plan.code}>{plan.name}</th>)}</tr></thead><tbody>{PLAN_ROWS.map((row) => <tr key={row.label}><th scope="row">{row.label}</th>{plans.data.map((plan) => <td key={plan.code}>{row.value(plan)}</td>)}</tr>)}</tbody></table></div><p className="demo-card-note">Pagos en modo DEMO durante el parcial: no se realizan cargos reales.</p></div>
  </section>;
}
