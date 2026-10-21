import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import type { AdminPlanResponse, Plan } from "@velora/contracts";
import { ApiClientError } from "../../core/api/apiClient";
import { veloraApi } from "../../core/api/veloraApi";
import { Notice } from "../../shared/feedback/Notice";
import { PageLoader } from "../../shared/ui/PageLoader";
import { limitLabel, planHighlights, priceLabel } from "./planCopy";
import { PlanErrorNotice } from "./PlanErrorNotice";

const STATUS_LABEL = { TRIAL: "PRUEBA", ACTIVE: "ACTIVA", PAST_DUE: "VENCIDA", CANCELLED: "CANCELADA" } as const;

function UsageRow({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const ratio = limit === null ? 0.08 : Math.min(1, used / Math.max(limit, 1));
  return <div className="usage-row"><header><span>{label}</span><strong>{used} / {limitLabel(limit)}</strong></header><div className={limit !== null && used >= limit ? "usage-bar full" : "usage-bar"}><span style={{ width: `${Math.round(ratio * 100)}%` }} /></div></div>;
}

function formatDate(value: string | null): string {
  return value ? new Intl.DateTimeFormat("es-BO", { dateStyle: "long" }).format(new Date(value)) : "Sin vencimiento";
}

export function MyPlanPage() {
  const client = useQueryClient(); const location = useLocation();
  const welcome = (location.state as { welcome?: string } | null)?.welcome;
  const summary = useQuery({ queryKey: ["admin-plan"], queryFn: veloraApi.adminPlan });
  const plans = useQuery({ queryKey: ["plans"], queryFn: veloraApi.plans });
  const [target, setTarget] = useState<Plan | null>(null);
  const [card, setCard] = useState({ cardNumber: "4242 4242 4242 4242", holderName: "" });
  const [done, setDone] = useState<string | null>(null);
  const change = useMutation({
    mutationFn: (plan: Plan) => veloraApi.changePlan({ planCode: plan.code, card: plan.priceMonthly > 0 ? card : null }),
    onSuccess: async (result: AdminPlanResponse) => { setDone(`Tu plan ahora es ${result.effectivePlan.name}.`); setTarget(null); client.setQueryData(["admin-plan"], result); await client.invalidateQueries({ queryKey: ["admin-reports"] }); },
  });

  if (summary.isLoading || plans.isLoading) return <PageLoader />;
  if (!summary.data) return <section className="page"><Notice kind="error">No se pudo cargar tu plan.</Notice></section>;
  const { effectivePlan, subscription, restricted, usage } = summary.data;
  const excess = change.error instanceof ApiClientError && change.error.code === "PLAN_DOWNGRADE_EXCEEDS" ? (change.error.details.excess as { resource: string; limit: number; used: number; companyId?: string }[] | undefined) ?? [] : [];
  const companyName = (id?: string) => usage.storesByCompany.find((company) => company.companyId === id)?.companyName ?? "";
  const resourceLabel: Record<string, string> = { companies: "Tiendas", stores: "Sucursales", products: "Productos" };

  return <section className="page">
    <div className="page-heading row"><div><span className="eyebrow">MI PLAN</span><h1>{effectivePlan.name}</h1><p>{effectivePlan.description}</p></div>{subscription ? <span className={subscription.status === "PAST_DUE" || subscription.status === "CANCELLED" ? "plan-status warn" : "plan-status"}>{STATUS_LABEL[subscription.status]}</span> : null}</div>
    {welcome ? <Notice kind="success">¡Listo! Tu tienda {welcome} fue creada con su sucursal principal, almacén y categorías base.</Notice> : null}
    {done ? <Notice kind="success">{done}</Notice> : null}
    {restricted ? <Notice kind="error">Tu suscripción {subscription?.planCode} no está vigente: aplican los límites de {effectivePlan.name} y no puedes crear nuevos recursos. Nada de lo existente se borra ni se oculta. Renueva o cambia de plan para continuar.</Notice> : null}
    <div className="two-columns">
      <div className="panel"><h2>Suscripción</h2><dl className="summary-list">
        <dt>Plan contratado</dt><dd>{subscription?.planCode ?? "—"}{subscription?.grandfathered ? " · condición especial" : ""}</dd>
        <dt>Estado</dt><dd>{subscription ? STATUS_LABEL[subscription.status] : "Sin suscripción (plan base)"}</dd>
        <dt>Periodo</dt><dd>{subscription ? `${formatDate(subscription.currentPeriodStart)} → ${formatDate(subscription.currentPeriodEnd)}` : "—"}</dd>
        <dt>Plan aplicado</dt><dd>{effectivePlan.name}</dd>
      </dl></div>
      <div className="panel"><h2>Uso frente a límites</h2><div className="usage-list">
        <UsageRow label="Tiendas" used={usage.companies} limit={effectivePlan.limits.maxCompanies} />
        {usage.storesByCompany.map((company) => <div key={company.companyId} className="usage-list"><UsageRow label={`Sucursales · ${company.companyName}`} used={company.stores} limit={effectivePlan.limits.maxStoresPerCompany} /><UsageRow label={`Productos · ${company.companyName}`} used={company.products} limit={effectivePlan.limits.maxProductsPerCompany} /></div>)}
      </div></div>
    </div>
    <div className="panel"><h2>Cambiar de plan</h2><p className="field-hint">El cambio a un plan superior es inmediato. Para bajar de plan, tu uso actual debe caber en los límites del plan elegido.</p>
      <div className="plan-grid">{plans.data?.map((plan) => {
        const current = plan.code === subscription?.planCode && subscription?.status === "ACTIVE" && !restricted;
        return <article key={plan.code} className={current ? "plan-card featured" : "plan-card"}>{current ? <span className="plan-ribbon">TU PLAN</span> : null}<span className="eyebrow">{plan.code}</span><h2>{plan.name}</h2><div className="plan-price">{priceLabel(plan)}{plan.priceMonthly > 0 ? <small>/ mes</small> : null}</div><ul>{planHighlights(plan).map((line) => <li key={line}>{line}</li>)}</ul>
          <button type="button" className={current ? "button secondary full" : "button primary full"} disabled={current} onClick={() => { change.reset(); setDone(null); setTarget(plan); }}>{current ? "Plan actual" : plan.sortOrder > effectivePlan.sortOrder ? "Mejorar" : plan.code === subscription?.planCode ? "Activar / renovar" : "Cambiar"}</button></article>;
      })}</div>
      {target ? <div className="panel"><h2>Confirmar cambio a {target.name}</h2>
        {target.priceMonthly > 0 ? <div className="form-grid"><label>Tarjeta DEMO<input value={card.cardNumber} onChange={(event) => setCard({ ...card, cardNumber: event.target.value })} inputMode="numeric" /></label><label>Titular<input value={card.holderName} onChange={(event) => setCard({ ...card, holderName: event.target.value })} /></label><p className="demo-card-note span-2">Se cobrarán {priceLabel(target)} (DEMO). 4242… se aprueba; 4000 0000 0000 0002 se rechaza.</p></div> : <p className="field-hint">Plan gratuito: no requiere pago.</p>}
        {excess.length > 0 ? <Notice kind="error">No puedes bajar a {target.name} todavía: {excess.map((item) => `${resourceLabel[item.resource] ?? item.resource}${item.companyId ? ` en ${companyName(item.companyId)}` : ""}: ${item.used} de ${item.limit} permitidos`).join(" · ")}.</Notice> : <PlanErrorNotice error={change.error} upgradeTo={null} />}
        <div className="actions"><button type="button" className="button secondary" onClick={() => setTarget(null)}>Cancelar</button><button type="button" className="button primary" disabled={change.isPending || (target.priceMonthly > 0 && card.holderName.trim().length < 2)} onClick={() => change.mutate(target)}>{change.isPending ? "Procesando…" : "Confirmar"}</button></div>
      </div> : null}
    </div>
  </section>;
}
