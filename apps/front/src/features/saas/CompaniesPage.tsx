import { DEFAULT_BRAND_PALETTE } from "@velora/contracts";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { validateBrandPalette } from "@velora/contracts";
import { veloraApi } from "../../core/api/veloraApi";
import { useCompanyStore } from "../../core/company/companyStore";
import { Notice } from "../../shared/feedback/Notice";
import { PlanErrorNotice } from "./PlanErrorNotice";
import { SlugHint } from "./SlugHint";
import { slugify, useSlugAvailability } from "./slugTools";

/** "Crear empresa" y "Crear sucursal" del propietario; el backend aplica los límites del plan. */
export function CompaniesPage() {
  const client = useQueryClient();
  const companies = useCompanyStore((state) => state.companies); const adminCompanyId = useCompanyStore((state) => state.adminCompanyId);
  const loadAdmin = useCompanyStore((state) => state.loadAdmin); const selectAdmin = useCompanyStore((state) => state.selectAdmin);
  const [draft, setDraft] = useState({ name: "", slug: "", tagline: "", accentColor: DEFAULT_BRAND_PALETTE.accent as string });
  const [message, setMessage] = useState<string | null>(null);
  const availability = useSlugAvailability(draft.slug);
  const issues = validateBrandPalette({ accent: draft.accentColor });
  const stores = useQuery({ queryKey: ["admin-stores", adminCompanyId], queryFn: () => veloraApi.adminStores(adminCompanyId!), enabled: Boolean(adminCompanyId) });

  const createCompany = useMutation({
    mutationFn: () => veloraApi.createCompany({ name: draft.name, slug: draft.slug, tagline: draft.tagline || null, accentColor: draft.accentColor }),
    onSuccess: async (company) => { setMessage(`Tienda ${company.name} creada con su sucursal principal, almacén y categorías base.`); setDraft({ name: "", slug: "", tagline: "", accentColor: DEFAULT_BRAND_PALETTE.accent as string }); await loadAdmin(); selectAdmin(company.id); await client.invalidateQueries({ queryKey: ["admin-plan"] }); },
  });
  const createStore = useMutation({
    mutationFn: veloraApi.createStore,
    onSuccess: async (store) => { setMessage(`Sucursal ${store.name} creada con su almacén por defecto.`); await client.invalidateQueries({ queryKey: ["admin-stores"] }); await client.invalidateQueries({ queryKey: ["admin-plan"] }); },
  });
  const submitStore = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!adminCompanyId) return; const form = event.currentTarget; const data = new FormData(form);
    createStore.mutate({ companyId: adminCompanyId, code: String(data.get("code") ?? "").toUpperCase(), name: String(data.get("name") ?? ""), address: String(data.get("address") ?? "") || null }, { onSuccess: () => form.reset() });
  };
  const companyReady = draft.name.trim().length >= 2 && availability.data?.available === true && availability.data.slug === draft.slug && issues.length === 0;

  return <section className="page">
    <div className="page-heading"><span className="eyebrow">MIS TIENDAS</span><h1>Tiendas y sucursales</h1><p>Administra varias tiendas desde una misma cuenta. Cada tienda nace con su sucursal principal, almacén por defecto y categorías base de moda.</p></div>
    {message ? <Notice kind="success">{message}</Notice> : null}
    <div className="two-columns">
      <form className="panel" onSubmit={(event) => { event.preventDefault(); setMessage(null); createCompany.mutate(); }}>
        <h2>Nueva tienda</h2>
        <label>Nombre comercial<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value, slug: slugify(event.target.value) })} maxLength={160} required /></label>
        <label>Enlace<div className="slug-field"><span>/t/</span><input value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: slugify(event.target.value) })} maxLength={60} required /></div><SlugHint slug={draft.slug} availability={availability} /></label>
        <label>Frase (opcional)<input value={draft.tagline} onChange={(event) => setDraft({ ...draft, tagline: event.target.value })} maxLength={200} /></label>
        <label>Color de la marca<div className="color-row"><input type="color" value={draft.accentColor} onChange={(event) => setDraft({ ...draft, accentColor: event.target.value.toUpperCase() })} /><input value={draft.accentColor} onChange={(event) => setDraft({ ...draft, accentColor: event.target.value.toUpperCase() })} maxLength={7} /></div>{issues[0] ? <span className="field-hint bad">{issues[0].message}</span> : null}</label>
        <PlanErrorNotice error={createCompany.error} />
        <button className="button primary" disabled={!companyReady || createCompany.isPending}>{createCompany.isPending ? "Creando…" : "Crear tienda"}</button>
      </form>
      <form className="panel" onSubmit={submitStore}>
        <h2>Nueva sucursal</h2>
        <label>Tienda<select value={adminCompanyId ?? ""} onChange={(event) => selectAdmin(event.target.value)} required><option value="" disabled>Seleccione</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.displayName ?? company.name}</option>)}</select></label>
        <label>Código<input name="code" required maxLength={40} /></label>
        <label>Nombre<input name="name" required maxLength={120} /></label>
        <label>Dirección (opcional)<input name="address" maxLength={240} /></label>
        <PlanErrorNotice error={createStore.error} />
        <button className="button primary" disabled={!adminCompanyId || createStore.isPending}>{createStore.isPending ? "Creando…" : "Crear sucursal"}</button>
      </form>
    </div>
    <div className="panel"><h2>Mis tiendas</h2><div className="table-wrap"><table><thead><tr><th>Tienda</th><th>Enlace</th><th>Estado</th><th /></tr></thead><tbody>{companies.map((company) => <tr key={company.id}><td>{company.displayName ?? company.name}</td><td>{company.slug ? <a className="text-link" href={`/t/${company.slug}`} target="_blank" rel="noreferrer">/t/{company.slug}</a> : "—"}</td><td>{company.active ? "Activa" : "Inactiva"}</td><td>{company.id === adminCompanyId ? <strong>Seleccionada</strong> : <button type="button" className="text-button" onClick={() => selectAdmin(company.id)}>Seleccionar</button>}</td></tr>)}</tbody></table></div></div>
    {adminCompanyId ? <div className="panel"><h2>Sucursales de la tienda seleccionada</h2><div className="table-wrap"><table><thead><tr><th>Código</th><th>Nombre</th><th>Dirección</th><th>Estado</th></tr></thead><tbody>{stores.data?.map((store) => <tr key={store.id}><td>{store.code}</td><td>{store.name}</td><td>{store.address ?? "—"}</td><td>{store.active ? "Activa" : "Inactiva"}</td></tr>)}</tbody></table></div></div> : null}
  </section>;
}
