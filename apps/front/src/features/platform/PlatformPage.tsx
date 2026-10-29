import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PlatformSubscription } from "@velora/contracts";
import { veloraApi } from "../../core/api/veloraApi";
import { PlanErrorNotice } from "../saas/PlanErrorNotice";
import { toast } from "../../shared/feedback/toastStore";

type Tab = "owners" | "companies" | "subscriptions";
const STATUS = { TRIAL: "Prueba", ACTIVE: "Activa", PAST_DUE: "Vencida", CANCELLED: "Cancelada" } as const;

const toLocalInput = (value: string | null) => value ? new Date(value).toISOString().slice(0, 16) : "";
const fromLocalInput = (value: string) => value ? new Date(value).toISOString() : null;
const shortDate = (value: string | null) => value ? new Intl.DateTimeFormat("es-BO", { dateStyle: "medium" }).format(new Date(value)) : "Sin vencimiento";

function SubscriptionRow({ subscription, onDone }: { subscription: PlatformSubscription; onDone: (message: string) => void }) {
  const client = useQueryClient();
  const [status, setStatus] = useState(subscription.status);
  const [start, setStart] = useState(toLocalInput(subscription.currentPeriodStart));
  const [end, setEnd] = useState(toLocalInput(subscription.currentPeriodEnd));
  const adjust = useMutation({
    mutationFn: () => {
      const periodStart = fromLocalInput(start);
      return veloraApi.platformAdjustSubscription(subscription.id, { status, currentPeriodEnd: fromLocalInput(end), ...(periodStart ? { currentPeriodStart: periodStart } : {}) });
    },
    onSuccess: async () => { onDone(`Suscripción de ${subscription.ownerEmail} actualizada.`); await client.invalidateQueries({ queryKey: ["platform"] }); },
  });
  return <tr><td>{subscription.ownerEmail}</td><td>{subscription.planCode}{subscription.grandfathered ? " · especial" : ""}</td>
    <td colSpan={3}><form className="inline-form" onSubmit={(event) => { event.preventDefault(); adjust.mutate(); }}>
      <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} aria-label="Estado">{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} aria-label="Inicio del periodo" />
      <input type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} aria-label="Fin del periodo (vacío = sin vencimiento)" />
      <button className="button secondary small" disabled={adjust.isPending}>Guardar</button>
    </form>{adjust.error ? <PlanErrorNotice error={adjust.error} upgradeTo={null} /> : null}</td></tr>;
}

/** Área mínima de PLATFORM_ADMIN: propietarios, empresas, suscripciones, cambio de plan y ajuste de fechas (D6). */
export function PlatformPage() {
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>("owners");
  const setMessage = (text: string | null) => { if (text) toast(text); }; // P3: aviso breve que se cierra solo
  const [transfer, setTransfer] = useState<Record<string, string>>({});
  const owners = useQuery({ queryKey: ["platform", "owners"], queryFn: veloraApi.platformOwners });
  const companies = useQuery({ queryKey: ["platform", "companies"], queryFn: veloraApi.platformCompanies });
  const subscriptions = useQuery({ queryKey: ["platform", "subscriptions"], queryFn: veloraApi.platformSubscriptions });
  const plans = useQuery({ queryKey: ["plans"], queryFn: veloraApi.plans });
  const refresh = () => client.invalidateQueries({ queryKey: ["platform"] });
  const changePlan = useMutation({ mutationFn: ({ ownerId, planCode }: { ownerId: string; planCode: string }) => veloraApi.platformChangePlan(ownerId, planCode), onSuccess: async (result) => { setMessage(`Plan cambiado a ${result.effectivePlan.name}.`); await refresh(); } });
  const transferOwner = useMutation({ mutationFn: ({ companyId, email }: { companyId: string; email: string }) => veloraApi.platformTransferOwner(companyId, email), onSuccess: async (company) => { setMessage(`${company.name} ahora pertenece a ${company.ownerEmail}.`); await refresh(); } });

  return <section className="page">
    <div className="page-heading"><span className="eyebrow">PLATAFORMA</span><h1>Operación SaaS</h1><p>Propietarios, tiendas y suscripciones de toda la plataforma. Los cambios de plan respetan las mismas reglas que ve el propietario (bajar de plan requiere que el uso quepa).</p></div>
    <div className="metric-grid"><article><span>Propietarios</span><strong>{owners.data?.length ?? "—"}</strong></article><article className="metric-tone-terracotta"><span>Tiendas</span><strong>{companies.data?.length ?? "—"}</strong></article><article className="metric-tone-success"><span>Suscripciones</span><strong>{subscriptions.data?.length ?? "—"}</strong></article></div>
    <div className="platform-tabs" role="tablist">{([["owners", "Propietarios"], ["companies", "Tiendas"], ["subscriptions", "Suscripciones"]] as const).map(([value, label]) => <button key={value} type="button" className="button secondary small" aria-pressed={tab === value} onClick={() => { setTab(value); setMessage(null); }}>{label}</button>)}</div>
    
    <PlanErrorNotice error={changePlan.error ?? transferOwner.error} upgradeTo={null} />
    {tab === "owners" ? <div className="panel"><h2>Propietarios</h2><div className="table-wrap"><table><thead><tr><th>Correo</th><th>Nombre</th><th>Tiendas</th><th>Plan</th><th>Estado</th><th>Cambiar plan</th></tr></thead><tbody>{owners.data?.map((owner) => <tr key={owner.id}><td>{owner.email}</td><td>{owner.firstName} {owner.lastName}</td><td>{owner.companies}</td><td>{owner.planCode ?? "—"}</td><td>{owner.subscriptionStatus ? STATUS[owner.subscriptionStatus] : owner.status}</td>
      <td><div className="inline-form">{plans.data?.map((plan) => <button key={plan.code} type="button" className="button secondary small" disabled={changePlan.isPending || plan.code === owner.planCode} onClick={() => changePlan.mutate({ ownerId: owner.id, planCode: plan.code })}>{plan.code}</button>)}</div></td></tr>)}</tbody></table></div></div> : null}
    {tab === "companies" ? <div className="panel"><h2>Tiendas</h2><div className="table-wrap"><table><thead><tr><th>Tienda</th><th>Enlace</th><th>Propietario</th><th>Sucursales</th><th>Productos</th><th>Transferir a (correo de un propietario)</th></tr></thead><tbody>{companies.data?.map((company) => <tr key={company.id}><td>{company.name}{company.active ? "" : " · inactiva"}</td><td><a className="text-link" href={`/t/${company.slug}`} target="_blank" rel="noreferrer">/t/{company.slug}</a></td><td>{company.ownerEmail ?? "Sin propietario"}</td><td>{company.stores}</td><td>{company.products}</td>
      <td><form className="inline-form" onSubmit={(event) => { event.preventDefault(); const email = transfer[company.id]?.trim(); if (email) transferOwner.mutate({ companyId: company.id, email }); }}><input type="email" placeholder="propietario@correo" value={transfer[company.id] ?? ""} onChange={(event) => setTransfer({ ...transfer, [company.id]: event.target.value })} /><button className="button secondary small" disabled={transferOwner.isPending}>Transferir</button></form></td></tr>)}</tbody></table></div></div> : null}
    {tab === "subscriptions" ? <div className="panel"><h2>Suscripciones</h2><p className="field-hint">Ajusta estado y fechas para demostrar vencimientos: al pasar la fecha de fin, la suscripción cae a “Vencida” la próxima vez que se consulta y aplican los límites de FREE.</p><div className="table-wrap"><table><thead><tr><th>Propietario</th><th>Plan</th><th colSpan={3}>Estado · inicio · fin (actual: {subscriptions.data?.length ?? 0})</th></tr></thead><tbody>{subscriptions.data?.map((subscription) => <SubscriptionRow key={`${subscription.id}-${subscription.updatedAt}`} subscription={subscription} onDone={setMessage} />)}</tbody></table></div>
      <p className="field-hint">Periodos actuales: {subscriptions.data?.map((subscription) => `${subscription.ownerEmail}: ${shortDate(subscription.currentPeriodEnd)}`).join(" · ")}</p></div> : null}
  </section>;
}
