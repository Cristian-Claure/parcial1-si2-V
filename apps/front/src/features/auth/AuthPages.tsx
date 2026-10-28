import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../core/auth/authStore";
import { postLoginPath } from "../../core/auth/postLoginPath";
import { ApiClientError } from "../../core/api/apiClient";
import { veloraApi } from "../../core/api/veloraApi";
import { lastStoreSlug } from "../../core/company/companyStore";
import { Notice } from "../../shared/feedback/Notice";
import type { LoginRedirectState } from "../../shared/auth/RouteGuards";

import { validateCustomerRegistration, type RegisterField } from "./registerValidation";
import { PLATFORM_NAME, PLATFORM_TAGLINE, PlatformBrand, WeaveMotif } from "../../shared/platform/PlatformBrand";

/** Panel de marca de la plataforma (sin fotos de tiendas): motivo de tejido vectorial y CTAs. */
function PlatformHero({ children }: { children?: ReactNode }) {
  return (
    <section className="platform-hero">
      <WeaveMotif />
      <PlatformBrand tone="dark" />
      <h1>{PLATFORM_TAGLINE}</h1>
      <p>La plataforma para marcas de moda: catálogo, inventario, punto de venta, pedidos en línea y reportes con inteligencia, con tu marca y tus colores.</p>
      <ul>
        <li>Tu tienda online en /t/tu-marca, lista en minutos</li>
        <li>Sucursales, encargados y caja, también sin conexión</li>
        <li>Reportes, exportación y Machine Learning según tu plan</li>
      </ul>
      {children}
    </section>
  );
}

/** "/" y "/login": entrada neutral de la plataforma Trama. */
export function LoginPage() {
  const login = useAuthStore((state) => state.login); const navigate = useNavigate(); const location = useLocation();
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const redirect = location.state as Partial<LoginRedirectState> | null;
  const expired = useAuthStore((state) => state.sessionExpired) || Boolean(redirect?.expired);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(null); const data = new FormData(event.currentTarget);
    try {
      const user = await login({ email: String(data.get("email") ?? ""), password: String(data.get("password") ?? "") });
      const adminCompanyCount = user.role === "ADMIN" ? (await veloraApi.adminCompanies().catch(() => [])).length : 0;
      const requested = redirect?.from ?? null;
      navigate(postLoginPath({ role: user.role, lastStoreSlug: lastStoreSlug(), adminCompanyCount, requested }), { replace: true });
    } catch (reason) { setError(reason instanceof ApiClientError ? reason.message : "No se pudo iniciar sesión."); } finally { setBusy(false); }
  };
  return (
    <main className="platform-auth">
      <PlatformHero>
        <div className="actions"><Link className="button secondary" to="/tiendas">Explorar tiendas</Link><Link className="button secondary" to="/planes">Ver planes</Link></div>
      </PlatformHero>
      <div className="platform-form-side">
        <form className="platform-card" onSubmit={(event) => void submit(event)}>
          <span className="eyebrow">BIENVENIDO</span>
          <h1>Ingresar a {PLATFORM_NAME}</h1>
          <p>Compra en tus tiendas favoritas o administra la tuya.</p>
          {expired && !error ? <Notice kind="warning">Tu sesión expiró. Ingresa de nuevo para continuar donde estabas.</Notice> : null}
          {error ? <Notice kind="error">{error}</Notice> : null}
          <label>Correo<input name="email" type="email" autoComplete="email" required /></label>
          <label>Contraseña<input name="password" type="password" autoComplete="current-password" required /></label>
          <button className="button primary" disabled={busy}>{busy ? "Ingresando…" : "Ingresar"}</button>
          <div className="platform-divider">¿Primera vez en {PLATFORM_NAME}?</div>
          <div className="platform-ctas">
            <Link className="button secondary" to="/registro">Crear cuenta</Link>
            <Link className="button secondary" to="/planes">Ver planes</Link>
          </div>
        </form>
      </div>
    </main>
  );
}

const BagIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 8h12l-1 12H7L6 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>;
const StoreIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 9 5.5 4h13L20 9" /><path d="M4 9h16v2a3 3 0 0 1-5.3 1.9A3 3 0 0 1 12 14a3 3 0 0 1-2.7-1.1A3 3 0 0 1 4 11V9Z" /><path d="M5 13v7h14v-7" /></svg>;

/** "/registro": dos caminos — cliente o dueño de tienda. */
export function RegisterChooserPage() {
  return (
    <main className="platform-auth">
      <PlatformHero />
      <div className="platform-form-side">
        <div className="platform-card wide">
          <span className="eyebrow">CREAR CUENTA</span>
          <h1>¿Cómo quieres usar {PLATFORM_NAME}?</h1>
          <div className="path-grid">
            <Link className="path-card" to="/registro/cliente"><span className="path-icon"><BagIcon /></span><strong>Soy cliente</strong><span>Compra en las tiendas de la plataforma, guarda favoritos y sigue tus pedidos.</span></Link>
            <Link className="path-card" to="/crear-tienda"><span className="path-icon"><StoreIcon /></span><strong>Quiero abrir mi tienda</strong><span>Crea tu marca, elige un plan y empieza a vender en minutos.</span></Link>
          </div>
          <p className="auth-switch">¿Ya tienes cuenta? <Link to="/login">Ingresar</Link></p>
        </div>
      </div>
    </main>
  );
}

/** "/registro/cliente": registro de cliente (el flujo existente). */
export function RegisterPage() {
  const register = useAuthStore((state) => state.register); const navigate = useNavigate();
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RegisterField, string>>>({});
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(null); const data = new FormData(event.currentTarget);
    const errors = validateCustomerRegistration({ firstName: String(data.get("firstName") ?? ""), lastName: String(data.get("lastName") ?? ""), email: String(data.get("email") ?? ""), password: String(data.get("password") ?? "") });
    setFieldErrors(errors); if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      await register({ firstName: String(data.get("firstName") ?? ""), lastName: String(data.get("lastName") ?? ""), email: String(data.get("email") ?? ""), password: String(data.get("password") ?? "") });
      navigate(postLoginPath({ role: "CUSTOMER", lastStoreSlug: lastStoreSlug(), adminCompanyCount: 0 }), { replace: true });
    } catch (reason) { setError(reason instanceof ApiClientError ? reason.message : "No se pudo crear la cuenta."); } finally { setBusy(false); }
  };
  return (
    <main className="platform-auth">
      <PlatformHero />
      <div className="platform-form-side">
        <form className="platform-card wide" noValidate onSubmit={(event) => void submit(event)}>
          <span className="eyebrow">SOY CLIENTE</span>
          <h1>Crea tu cuenta de cliente</h1>
          {error ? <Notice kind="error">{error}</Notice> : null}
          <div className="form-grid">
            <label>Nombre<input name="firstName" required maxLength={80} autoComplete="given-name" aria-invalid={Boolean(fieldErrors.firstName)} aria-describedby="err-firstName" />{fieldErrors.firstName ? <small className="field-error" id="err-firstName">{fieldErrors.firstName}</small> : null}</label>
            <label>Apellido<input name="lastName" required maxLength={100} autoComplete="family-name" aria-invalid={Boolean(fieldErrors.lastName)} aria-describedby="err-lastName" />{fieldErrors.lastName ? <small className="field-error" id="err-lastName">{fieldErrors.lastName}</small> : null}</label>
            <label className="span-2">Correo<input name="email" type="email" required maxLength={180} autoComplete="email" aria-invalid={Boolean(fieldErrors.email)} aria-describedby="err-email" />{fieldErrors.email ? <small className="field-error" id="err-email">{fieldErrors.email}</small> : null}</label>
            <label className="span-2">Contraseña<input name="password" type="password" minLength={8} maxLength={72} required autoComplete="new-password" aria-invalid={Boolean(fieldErrors.password)} aria-describedby="err-password" />{fieldErrors.password ? <small className="field-error" id="err-password">{fieldErrors.password}</small> : <small id="err-password">Incluye mayúscula, minúscula y número.</small>}</label>
          </div>
          <button className="button primary" disabled={busy}>{busy ? "Creando…" : "Crear cuenta"}</button>
          <p className="auth-switch">¿Quieres vender? <Link to="/crear-tienda">Abre tu tienda</Link> · <Link to="/login">Ingresar</Link></p>
        </form>
      </div>
    </main>
  );
}
