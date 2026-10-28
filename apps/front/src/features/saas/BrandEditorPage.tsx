import { useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  brandingAllows, contrastRatio, DEFAULT_BRAND_PALETTE, resolveBrandPalette, validateBrandPalette,
  type AdminBrandingResponse, type BrandPalette, type BrandingField, type CompanyBrand, type CompanyContact, type UpdateBrandingRequest,
} from "@velora/contracts";
import { veloraApi } from "../../core/api/veloraApi";
import { useCompanyStore } from "../../core/company/companyStore";
import { Brand } from "../../shared/brand";
import { tenantStyle } from "../../shared/brand/tenantStyle";
import { Notice } from "../../shared/feedback/Notice";
import { PageLoader } from "../../shared/ui/PageLoader";
import { PlanErrorNotice } from "./PlanErrorNotice";

const DEFAULT_ACCENT = DEFAULT_BRAND_PALETTE.accent;
const REQUIRED_PLAN: Partial<Record<BrandingField, string>> = { fullPalette: "PLUS", tagline: "MAX", banner: "MAX", contact: "MAX" };

interface Draft { displayName: string; slug: string; tagline: string; palette: { accent: string; primary: string; paper: string; ink: string }; contact: { phone: string; email: string; address: string; instagram: string; facebook: string; whatsapp: string } }

function draftFrom(data: AdminBrandingResponse): Draft {
  const stored = data.stored; const resolved = data.brand.palette;
  return {
    displayName: stored.displayName ?? data.brand.name, slug: stored.slug, tagline: stored.tagline ?? "",
    palette: { accent: stored.palette?.accent ?? resolved.accent, primary: stored.palette?.primary ?? resolved.primary, paper: stored.palette?.paper ?? resolved.paper, ink: stored.palette?.ink ?? resolved.ink },
    contact: { phone: stored.contact?.phone ?? "", email: stored.contact?.email ?? "", address: stored.contact?.address ?? "", instagram: stored.contact?.socials?.instagram ?? "", facebook: stored.contact?.socials?.facebook ?? "", whatsapp: stored.contact?.socials?.whatsapp ?? "" },
  };
}

function ColorField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  return <label>{label}<div className="color-row"><input type="color" value={/^#[0-9A-Fa-f]{6}$/.test(value) ? value : DEFAULT_ACCENT} onChange={(event) => onChange(event.target.value.toUpperCase())} disabled={disabled} /><input value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} maxLength={7} disabled={disabled} /></div></label>;
}

function Locked({ field, allowed }: { field: BrandingField; allowed: boolean }) {
  return allowed ? null : <span className="field-hint">Disponible en {REQUIRED_PLAN[field] ?? "un plan superior"}.</span>;
}

/** Editor de marca por empresa con vista previa en vivo (misma regla AA que el backend). */
export function BrandEditorPage() {
  const companyId = useCompanyStore((state) => state.adminCompanyId); const loadAdmin = useCompanyStore((state) => state.loadAdmin);
  const client = useQueryClient();
  const branding = useQuery({ queryKey: ["admin-branding", companyId], queryFn: () => veloraApi.adminBranding(companyId!), enabled: Boolean(companyId) });
  if (!companyId) return <section className="page"><Notice>Seleccione una tienda en el menú lateral.</Notice></section>;
  if (branding.isLoading || !branding.data) return <PageLoader />;
  return <BrandEditorForm key={companyId} companyId={companyId} data={branding.data} onSaved={async (result) => { client.setQueryData(["admin-branding", companyId], result); await loadAdmin(); }} />;
}

function BrandEditorForm({ companyId, data, onSaved }: { companyId: string; data: AdminBrandingResponse; onSaved: (result: AdminBrandingResponse) => Promise<void> }) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(data));
  const [saved, setSaved] = useState(false);
  const tier = data.brand.tier;
  const can = (field: BrandingField) => brandingAllows(tier, field);

  const palette: Partial<BrandPalette> = can("fullPalette") ? draft.palette : { accent: draft.palette.accent };
  const validHex = Object.values(palette).every((value) => /^#[0-9A-F]{6}$/i.test(String(value)));
  const issues = validHex ? validateBrandPalette(palette) : [{ field: "accent" as const, message: "Use colores hexadecimales #RRGGBB.", ratio: 0 }];
  const resolved = resolveBrandPalette(validHex ? palette : null);
  const onSuccess = async (result: AdminBrandingResponse) => { setSaved(true); await onSaved(result); };
  const save = useMutation({
    mutationFn: () => {
      const contact: CompanyContact = { phone: draft.contact.phone || null, email: draft.contact.email || null, address: draft.contact.address || null, socials: { ...(draft.contact.instagram ? { instagram: draft.contact.instagram } : {}), ...(draft.contact.facebook ? { facebook: draft.contact.facebook } : {}), ...(draft.contact.whatsapp ? { whatsapp: draft.contact.whatsapp } : {}) } };
      const body: UpdateBrandingRequest = {
        displayName: draft.displayName, slug: draft.slug,
        palette: can("fullPalette") ? draft.palette : { accent: draft.palette.accent },
        ...(can("tagline") ? { tagline: draft.tagline || null } : {}),
        ...(can("contact") ? { contact } : {}),
      };
      return veloraApi.updateBranding(companyId, body);
    },
    onSuccess,
  });
  const upload = useMutation({ mutationFn: ({ kind, file }: { kind: "logo" | "banner"; file: File }) => veloraApi.uploadBrandAsset(companyId, kind, file), onSuccess });
  const remove = useMutation({ mutationFn: (kind: "logo" | "banner") => veloraApi.removeBrandAsset(companyId, kind), onSuccess });
  const brand = data.brand;
  const preview: CompanyBrand = { ...brand, name: draft.displayName || brand.name, slug: draft.slug, tagline: can("tagline") ? draft.tagline || null : null, palette: resolved, isPlatformBrand: false };
  const setPalette = (key: keyof Draft["palette"]) => (value: string) => { setSaved(false); setDraft({ ...draft, palette: { ...draft.palette, [key]: value } }); };
  const setContact = (key: keyof Draft["contact"]) => (value: string) => { setSaved(false); setDraft({ ...draft, contact: { ...draft.contact, [key]: value } }); };
  const checks = [
    { label: "Texto sobre fondo", ratio: contrastRatio(resolved.ink, resolved.paper) },
    { label: "Texto del botón sobre el acento", ratio: contrastRatio(resolved.onAccent, resolved.accent) },
    { label: "Superficies oscuras (fondo sobre texto)", ratio: contrastRatio(resolved.paper, resolved.ink) },
  ];
  const pickFile = (kind: "logo" | "banner") => (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) upload.mutate({ kind, file }); event.target.value = ""; };

  return <section className="page">
    <div className="page-heading row"><div><span className="eyebrow">MARCA</span><h1>{brand.name}</h1><p>Nivel de marca de tu plan: {tier === "BASIC" ? "básica (nombre, logo y 1 color)" : tier === "FULL_PALETTE" ? "paleta completa" : "marca completa"}.</p></div><a className="button secondary small" href={`/t/${brand.slug}`} target="_blank" rel="noreferrer">Ver tienda</a></div>
    {saved ? <Notice kind="success">Marca guardada. Tu tienda pública ya la muestra.</Notice> : null}
    <PlanErrorNotice error={save.error ?? upload.error ?? remove.error} />
    <div className="brand-editor">
      <form className="panel" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
        <h2>Identidad</h2>
        <label>Nombre comercial<input value={draft.displayName} onChange={(event) => { setSaved(false); setDraft({ ...draft, displayName: event.target.value }); }} maxLength={160} required /></label>
        <label>Enlace<div className="slug-field"><span>/t/</span><input value={draft.slug} onChange={(event) => { setSaved(false); setDraft({ ...draft, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }); }} maxLength={60} required /></div></label>
        <label>Frase de marca<input value={draft.tagline} onChange={(event) => { setSaved(false); setDraft({ ...draft, tagline: event.target.value }); }} maxLength={200} disabled={!can("tagline")} /><Locked field="tagline" allowed={can("tagline")} /></label>
        <div className="asset-drop">{brand.logoUrl ? <img src={brand.logoUrl} alt="Logo actual" /> : null}<label className="button secondary small">Subir logo<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pickFile("logo")} /></label>{brand.logoUrl ? <button type="button" className="text-button" onClick={() => remove.mutate("logo")}>Quitar</button> : null}</div>
        <div className="asset-drop">{brand.bannerUrl ? <img src={brand.bannerUrl} alt="Banner actual" /> : null}<label className={can("banner") ? "button secondary small" : "button secondary small disabled"} aria-disabled={!can("banner")}>Subir banner<input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={!can("banner")} onChange={pickFile("banner")} /></label>{brand.bannerUrl ? <button type="button" className="text-button" onClick={() => remove.mutate("banner")}>Quitar</button> : null}<Locked field="banner" allowed={can("banner")} /></div>
        <h2>Colores</h2>
        <ColorField label="Acento" value={draft.palette.accent} onChange={setPalette("accent")} disabled={false} />
        <div className="form-grid">
          <ColorField label="Primario" value={draft.palette.primary} onChange={setPalette("primary")} disabled={!can("fullPalette")} />
          <ColorField label="Fondo" value={draft.palette.paper} onChange={setPalette("paper")} disabled={!can("fullPalette")} />
          <ColorField label="Texto" value={draft.palette.ink} onChange={setPalette("ink")} disabled={!can("fullPalette")} />
        </div>
        <Locked field="fullPalette" allowed={can("fullPalette")} />
        <ul className="contrast-list">{checks.map((check) => <li key={check.label} className={check.ratio >= 4.5 ? "ok" : "bad"}>{check.ratio >= 4.5 ? "✓" : "✕"} {check.label}: {check.ratio}:1 {check.ratio >= 4.5 ? "(AA)" : "(mínimo 4.5:1)"}</li>)}</ul>
        <h2>Contacto y redes</h2>
        <div className="form-grid">
          <label>Teléfono<input value={draft.contact.phone} onChange={(event) => setContact("phone")(event.target.value)} disabled={!can("contact")} /></label>
          <label>Correo<input type="email" value={draft.contact.email} onChange={(event) => setContact("email")(event.target.value)} disabled={!can("contact")} /></label>
          <label className="span-2">Dirección<input value={draft.contact.address} onChange={(event) => setContact("address")(event.target.value)} disabled={!can("contact")} /></label>
          <label>Instagram<input value={draft.contact.instagram} onChange={(event) => setContact("instagram")(event.target.value)} disabled={!can("contact")} /></label>
          <label>WhatsApp<input value={draft.contact.whatsapp} onChange={(event) => setContact("whatsapp")(event.target.value)} disabled={!can("contact")} /></label>
        </div>
        <Locked field="contact" allowed={can("contact")} />
        {issues.length ? <Notice kind="error">{issues[0]!.message}</Notice> : null}
        <button className="button primary" disabled={save.isPending || issues.length > 0}>{save.isPending ? "Guardando…" : "Guardar marca"}</button>
      </form>
      <aside className="brand-preview" data-tenant={preview.slug} style={tenantStyle(preview)} aria-label="Vista previa de la tienda">
        <div className="brand-preview-header"><Brand variant="lockup" brand={preview} showTagline /><span className="field-hint">Vista previa</span></div>
        <div className={preview.bannerUrl ? "brand-preview-hero with-banner" : "brand-preview-hero"} style={preview.bannerUrl ? { backgroundImage: `linear-gradient(90deg, rgba(var(--shadow-rgb), .55), rgba(var(--shadow-rgb), .1)), url(${preview.bannerUrl})` } : undefined}><span className="eyebrow">{preview.name.toUpperCase()}</span><h3>{preview.tagline ?? `Bienvenida a ${preview.name}`}</h3><button type="button" className="brand-accent-button">Ver catálogo</button></div>
        <div className="brand-preview-body">{["Vestido", "Blazer"].map((name) => <div key={name} className="brand-preview-card"><div className="brand-preview-swatch" /><strong>{name}</strong><p className="field-hint">Desde 249 BOB</p></div>)}</div>
        <div className="brand-preview-dark">Superficie oscura con el texto de tu marca</div>
      </aside>
    </div>
  </section>;
}
