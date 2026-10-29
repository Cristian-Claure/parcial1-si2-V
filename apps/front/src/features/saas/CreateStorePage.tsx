import { DEFAULT_BRAND_PALETTE } from "@velora/contracts";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { contrastRatio, resolveBrandPalette, validateBrandPalette, type Plan } from "@velora/contracts";
import { veloraApi } from "../../core/api/veloraApi";
import { useAuthStore } from "../../core/auth/authStore";
import { useCompanyStore } from "../../core/company/companyStore";
import { Notice } from "../../shared/feedback/Notice";
import { planHighlights, priceLabel } from "./planCopy";
import { PlanErrorNotice } from "./PlanErrorNotice";
import { SlugHint } from "./SlugHint";
import { slugify, useSlugAvailability } from "./slugTools";
import { PageSkeleton } from "../../shared/ui/Skeleton";

const STEPS = ["Tu cuenta", "Tu tienda", "Tu plan", "Confirmar"] as const;

export function CreateStorePage() {
  const [params] = useSearchParams(); const navigate = useNavigate();
  const adopt = useAuthStore((state) => state.adopt); const loadAdmin = useCompanyStore((state) => state.loadAdmin); const selectAdmin = useCompanyStore((state) => state.selectAdmin);
  const plans = useQuery({ queryKey: ["plans"], queryFn: veloraApi.plans });
  const [step, setStep] = useState(0);
  const [owner, setOwner] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [company, setCompany] = useState({ name: "", slug: "", tagline: "", accentColor: DEFAULT_BRAND_PALETTE.accent as string, city: "" });
  const [slugTouched, setSlugTouched] = useState(false);
  const [planCode, setPlanCode] = useState(params.get("plan") ?? "FREE");
  const [card, setCard] = useState({ cardNumber: "4242 4242 4242 4242", holderName: "" });
  const availability = useSlugAvailability(company.slug);
  const plan: Plan | undefined = plans.data?.find((candidate) => candidate.code === planCode);
  const needsCard = Boolean(plan && plan.priceMonthly > 0 && plan.trialDays === 0);
  const paletteIssues = useMemo(() => validateBrandPalette({ accent: company.accentColor }), [company.accentColor]);
  const palette = resolveBrandPalette({ accent: company.accentColor });

  const register = useMutation({
    mutationFn: () => veloraApi.registerStore({
      owner, planCode,
      company: { name: company.name, slug: company.slug, tagline: company.tagline || null, accentColor: company.accentColor, city: company.city || null },
      card: needsCard ? card : null,
    }),
    onSuccess: async (result) => { adopt(result.auth); selectAdmin(result.company.id); await loadAdmin(); navigate("/admin/mi-plan", { replace: true, state: { welcome: result.company.name } }); },
  });

  if (plans.isLoading) return <PageSkeleton />;
  const ownerValid = owner.firstName.trim() && owner.lastName.trim() && /\S+@\S+\.\S+/.test(owner.email) && /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(owner.password);
  const companyValid = company.name.trim().length >= 2 && availability.data?.available === true && availability.data.slug === company.slug && paletteIssues.length === 0;
  const canContinue = [ownerValid, companyValid, Boolean(plan), !needsCard || (card.cardNumber.replace(/\s/g, "").length >= 12 && card.holderName.trim().length >= 2)][step];

  return <section className="page"><div className="wizard">
    <div className="page-heading"><span className="eyebrow">CREAR MI TIENDA</span><h1>Abre tu tienda en minutos</h1><p>Creamos tu cuenta propietaria, tu tienda con su sucursal principal, el almacén y las categorías base de moda en un solo paso.</p></div>
    <ol className="wizard-steps">{STEPS.map((label, index) => <li key={label} className={index === step ? "active" : index < step ? "done" : ""}>{index + 1}. {label}</li>)}</ol>
    <div className="panel">
      {step === 0 ? <><h2>Tu cuenta propietaria</h2><p className="field-hint">Con esta cuenta administrarás tus tiendas. Un correo solo puede tener un rol: usa uno distinto al de tus compras.</p><div className="form-grid">
        <label>Nombre<input value={owner.firstName} onChange={(event) => setOwner({ ...owner, firstName: event.target.value })} autoComplete="given-name" required /></label>
        <label>Apellido<input value={owner.lastName} onChange={(event) => setOwner({ ...owner, lastName: event.target.value })} autoComplete="family-name" required /></label>
        <label className="span-2">Correo<input type="email" value={owner.email} onChange={(event) => setOwner({ ...owner, email: event.target.value })} autoComplete="email" required /></label>
        <label className="span-2">Contraseña<input type="password" value={owner.password} onChange={(event) => setOwner({ ...owner, password: event.target.value })} autoComplete="new-password" required /><span className="field-hint">8+ caracteres con mayúscula, minúscula y número.</span></label>
      </div></> : null}
      {step === 1 ? <><h2>Tu tienda</h2><div className="form-grid">
        <label className="span-2">Nombre comercial<input value={company.name} onChange={(event) => setCompany({ ...company, name: event.target.value, slug: slugTouched ? company.slug : slugify(event.target.value) })} maxLength={160} required /></label>
        <label className="span-2">Enlace de tu tienda<div className="slug-field"><span>/t/</span><input value={company.slug} onChange={(event) => { setSlugTouched(true); setCompany({ ...company, slug: slugify(event.target.value) }); }} maxLength={60} required /></div><SlugHint slug={company.slug} availability={availability} /></label>
        <label className="span-2">Frase de la marca (opcional)<input value={company.tagline} onChange={(event) => setCompany({ ...company, tagline: event.target.value })} maxLength={200} /></label>
        <label>Ciudad (opcional)<input value={company.city} onChange={(event) => setCompany({ ...company, city: event.target.value })} maxLength={120} /></label>
        <label>Color de la marca<div className="color-row"><input type="color" value={company.accentColor} onChange={(event) => setCompany({ ...company, accentColor: event.target.value.toUpperCase() })} /><input value={company.accentColor} onChange={(event) => setCompany({ ...company, accentColor: event.target.value.toUpperCase() })} maxLength={7} /></div>
          <span className={paletteIssues.length ? "field-hint bad" : "field-hint ok"}>{paletteIssues.length ? paletteIssues[0]!.message : `Contraste del botón ${contrastRatio(palette.onAccent, palette.accent)}:1 (AA)`}</span></label>
      </div><p className="field-hint">Podrás completar logo, banner, paleta y contacto desde “Marca” en tu panel.</p></> : null}
      {step === 2 ? <><h2>Elige tu plan</h2><div className="plan-grid">{plans.data?.map((candidate) => <button type="button" key={candidate.code} className={candidate.code === planCode ? "plan-card selectable selected" : "plan-card selectable"} onClick={() => setPlanCode(candidate.code)} aria-pressed={candidate.code === planCode}>
        <span className="eyebrow">{candidate.code}</span><h2>{candidate.name}</h2><div className="plan-price">{priceLabel(candidate)}{candidate.priceMonthly > 0 ? <small>/ mes</small> : null}</div><ul>{planHighlights(candidate).map((line) => <li key={line}>{line}</li>)}</ul>
      </button>)}</div></> : null}
      {step === 3 ? <><h2>Confirma y crea tu tienda</h2><dl className="summary-list">
        <dt>Propietario</dt><dd>{owner.firstName} {owner.lastName} · {owner.email}</dd>
        <dt>Tienda</dt><dd>{company.name} · /t/{company.slug}</dd>
        <dt>Plan</dt><dd>{plan ? `${plan.name} · ${priceLabel(plan)}${plan.priceMonthly > 0 ? " / mes" : ""}` : "—"}</dd>
        <dt>Suscripción</dt><dd>{plan && plan.trialDays > 0 ? `Prueba de ${plan.trialDays} días sin cargo` : plan && plan.priceMonthly > 0 ? "Cobro inmediato (DEMO)" : "Gratis, sin vencimiento"}</dd>
      </dl>
        {needsCard ? <div className="form-grid"><label>Tarjeta DEMO<input value={card.cardNumber} onChange={(event) => setCard({ ...card, cardNumber: event.target.value })} inputMode="numeric" /></label><label>Titular<input value={card.holderName} onChange={(event) => setCard({ ...card, holderName: event.target.value })} /></label><p className="demo-card-note span-2">Pasarela DEMO: 4242… se aprueba y 4000 0000 0000 0002 se rechaza. No se guarda el número.</p></div> : null}
        <PlanErrorNotice error={register.error} upgradeTo={null} />
      </> : null}
      <div className="wizard-actions">
        <button type="button" className="button secondary" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0 || register.isPending}>Atrás</button>
        {step < 3 ? <button type="button" className="button primary" disabled={!canContinue} onClick={() => setStep(step + 1)}>Continuar</button> : <button type="button" className="button primary" disabled={!canContinue || register.isPending} onClick={() => register.mutate()}>{register.isPending ? "Creando tu tienda…" : "Crear mi tienda"}</button>}
      </div>
    </div>
    {plans.isError ? <Notice kind="error">No se pudieron cargar los planes.</Notice> : null}
  </div></section>;
}
