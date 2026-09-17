import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../core/auth/authStore";
import { ApiClientError } from "../../core/api/apiClient";
import { Notice } from "../../shared/feedback/Notice";
import { Brand } from "../../shared/brand";
import loginVisual from "../../assets/hero/VELORA9.png";
import registerVisual from "../../assets/hero/VELORA10.png";

function targetForRole(role: "ADMIN" | "STORE_MANAGER" | "CUSTOMER"): string {
  return role === "ADMIN" ? "/admin" : role === "STORE_MANAGER" ? "/sucursal" : "/mis-pedidos";
}

function AuthVisual({ src, position }: { src: string; position: string }) {
  return <div className="auth-visual"><img src={src} alt="" style={{ objectPosition: position }} /><div className="auth-visual-scrim" /><div className="auth-visual-brand"><Brand variant="wordmark" /><span className="brand-tagline">More than fashion</span></div></div>;
}

export function LoginPage() {
  const login = useAuthStore((state) => state.login); const navigate = useNavigate(); const location = useLocation();
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(null); const data = new FormData(event.currentTarget);
    try {
      const user = await login({ email: String(data.get("email") ?? ""), password: String(data.get("password") ?? "") });
      const requested = (location.state as { from?: string } | null)?.from;
      navigate(requested && user.role === "CUSTOMER" ? requested : targetForRole(user.role), { replace: true });
    } catch (reason) { setError(reason instanceof ApiClientError ? reason.message : "No se pudo iniciar sesión."); } finally { setBusy(false); }
  };
  return <main className="auth-page"><AuthVisual src={loginVisual} position="72% 25%" /><div className="auth-form-side"><form className="auth-card" onSubmit={(event) => void submit(event)}><span className="eyebrow">BIENVENIDO</span><h1>Ingresar a VÉLORA</h1><p>Continúe con su experiencia de compra u operación.</p>{error ? <Notice kind="error">{error}</Notice> : null}<label>Correo<input name="email" type="email" autoComplete="email" required /></label><label>Contraseña<input name="password" type="password" autoComplete="current-password" required /></label><button className="button primary" disabled={busy}>{busy ? "Ingresando…" : "Ingresar"}</button><p className="auth-switch">¿Aún no tiene cuenta? <Link to="/registro">Regístrese</Link></p></form></div></main>;
}

export function RegisterPage() {
  const register = useAuthStore((state) => state.register); const navigate = useNavigate();
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(null); const data = new FormData(event.currentTarget);
    try {
      await register({ firstName: String(data.get("firstName") ?? ""), lastName: String(data.get("lastName") ?? ""), email: String(data.get("email") ?? ""), password: String(data.get("password") ?? "") });
      navigate("/catalogo", { replace: true });
    } catch (reason) { setError(reason instanceof ApiClientError ? reason.message : "No se pudo crear la cuenta."); } finally { setBusy(false); }
  };
  return <main className="auth-page"><AuthVisual src={registerVisual} position="70% 30%" /><div className="auth-form-side"><form className="auth-card wide" onSubmit={(event) => void submit(event)}><span className="eyebrow">NUEVA CUENTA</span><h1>Crear cuenta CUSTOMER</h1>{error ? <Notice kind="error">{error}</Notice> : null}<div className="form-grid"><label>Nombre<input name="firstName" required maxLength={80} /></label><label>Apellido<input name="lastName" required maxLength={100} /></label><label className="span-2">Correo<input name="email" type="email" required maxLength={180} /></label><label className="span-2">Contraseña<input name="password" type="password" minLength={8} maxLength={72} required /><small>Incluya mayúscula, minúscula y número.</small></label></div><button className="button primary" disabled={busy}>{busy ? "Creando…" : "Crear cuenta"}</button><p className="auth-switch">¿Ya tiene cuenta? <Link to="/login">Ingresar</Link></p></form></div></main>;
}
