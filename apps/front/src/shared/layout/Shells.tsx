import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { veloraApi } from "../../core/api/veloraApi";
import { chooseCompanyPath, equivalentOwnerPath, type UserRole } from "@velora/contracts";
import { useAuthStore } from "../../core/auth/authStore";
import { useCompanyStore } from "../../core/company/companyStore";
import { Brand } from "../brand";
import { TenantTheme } from "../brand/TenantTheme";
import { useOperationalBrand, useStorefrontBrand } from "../../core/company/useBrand";
import { SyncIndicator } from "../../features/sync/SyncIndicator";
import { postLoginPath } from "../../core/auth/postLoginPath";
import { PLATFORM_NAME, PLATFORM_TAGLINE, PlatformBrand, PlatformTheme } from "../platform/PlatformBrand";

const customerNav = [
  ["Catálogo", "/catalogo"], ["Probador", "/probador"], ["Favoritos", "/favoritos"], ["Mi bolsa", "/bolsa"], ["Mis pedidos", "/mis-pedidos"], ["Mi cuenta", "/mi-cuenta"],
] as const;
const adminNav = [
  ["Resumen", "/admin"], ["Catálogo", "/admin/catalogo"], ["Inventario", "/admin/inventario"], ["Pedidos", "/admin/pedidos"],
  ["Caja (POS)", "/admin/pos"], ["Reportes", "/admin/reportes"], ["Inteligencia", "/admin/ml"], ["Auditoría", "/admin/auditoria"],
  ["Registro sin conexión", "/admin/registro"], ["Sincronización", "/admin/sincronizacion"],
  ["Mis tiendas", "/admin/empresas"], ["Marca", "/admin/marca"], ["Mi plan", "/admin/mi-plan"],
] as const;
const managerNav = [
  ["Sucursal", "/sucursal"], ["Catálogo", "/sucursal/catalogo"], ["Inventario", "/sucursal/inventario"], ["Pedidos", "/sucursal/pedidos"],
  ["Caja (POS)", "/sucursal/pos"], ["Reportes", "/sucursal/reportes"],
  ["Registro sin conexión", "/sucursal/registro"], ["Sincronización", "/sucursal/sincronizacion"],
] as const;

function NavItems({ items, locked = {} }: { items: readonly (readonly [string, string])[]; locked?: Record<string, string> }) {
  return <>{items.map(([label, to]) => <NavLink key={to} to={to} end={to === "/admin" || to === "/sucursal" || to === "/plataforma"} className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>{label}{locked[to] ? <span className="nav-lock" title={`Disponible en ${locked[to]}`}>{locked[to]}</span> : null}</NavLink>)}</>;
}

/**
 * Marco con barra lateral: en pantallas de menos de 1000px la barra se colapsa y se abre con el
 * botón de menú (se cierra al navegar, con Escape o tocando fuera).
 */
function SidebarFrame({ sidebar, children, ops = false, title, platform = false }: { sidebar: ReactNode; children: ReactNode; ops?: boolean; title: string; platform?: boolean }) {
  // El menú queda abierto solo en la ruta donde se abrió: al navegar se cierra sin efectos extra.
  const location = useLocation(); const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === location.pathname;
  const setOpen = (value: boolean | ((current: boolean) => boolean)) => setOpenOn((typeof value === "function" ? value(open) : value) ? location.pathname : null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenOn(null); };
    document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return <div className="app-shell" data-platform={platform ? "trama" : undefined}>
    <div className="mobile-topbar">
      <button type="button" className="menu-toggle" aria-label={open ? "Cerrar menú" : "Abrir menú"} aria-expanded={open} aria-controls="app-sidebar" onClick={() => setOpen((value) => !value)}><span aria-hidden="true" /></button>
      <strong className="mobile-topbar-title">{title}</strong>
    </div>
    <aside id="app-sidebar" className={ops ? "sidebar ops" : "sidebar"} data-open={open} aria-label="Menú principal">{sidebar}</aside>
    {open ? <div className="sidebar-backdrop" role="presentation" onClick={() => setOpen(false)} /> : null}
    <main className="app-content">{children}</main>
  </div>;
}

/** Cerrar sesión: limpia empresa y tema (authStore.logout) y vuelve a la entrada neutral "/". */
function useLogout() {
  const logout = useAuthStore((state) => state.logout); const navigate = useNavigate();
  // Primero se sale a "/" (marcado como cierre de sesión) y luego se limpia: así ninguna guarda
  // de rol redirige al login con `from` mientras el cierre está en curso.
  return () => { navigate("/", { replace: true, state: { loggedOut: true } }); void logout(); };
}

export function PublicShell() {
  const user = useAuthStore((state) => state.user); const brand = useStorefrontBrand();
  const home = brand ? `/t/${brand.slug}` : "/tiendas";
  return <TenantTheme brand={brand}><header className="public-header"><Link to={home} aria-label="Inicio de la tienda"><Brand variant="lockup" brand={brand} showTagline /></Link><nav aria-label="Tienda"><NavLink to="/catalogo">Catálogo</NavLink>{user?.role === "CUSTOMER" ? <NavLink to="/bolsa">Mi bolsa</NavLink> : null}<NavLink to="/tiendas">Otras tiendas</NavLink></nav><div className="header-actions">{user ? <RoleLink role={user.role} /> : <><Link to="/login">Ingresar</Link><Link className="button small" to="/registro">Crear cuenta</Link></>}</div></header><Outlet /><footer className="public-footer"><Brand variant="wordmark" brand={brand} /><span>{brand ? <>Tienda en <Link to="/tiendas">{PLATFORM_NAME}</Link></> : <Link to="/tiendas">Ver tiendas en {PLATFORM_NAME}</Link>}</span></footer></TenantTheme>;
}

function RoleLink({ role }: { role: UserRole }) {
  const to = role === "CUSTOMER" ? "/mis-pedidos" : postLoginPath({ role, lastStoreSlug: null, adminCompanyCount: 0 });
  return <Link className="button small" to={to}>Mi espacio</Link>;
}

/** Header y footer públicos de la plataforma Trama (entrada neutral, planes, directorio, alta de tienda). */
export function PlatformPublicShell() {
  const user = useAuthStore((state) => state.user);
  return <PlatformTheme>
    <header className="platform-header">
      <Link to="/" aria-label={`${PLATFORM_NAME}: inicio`}><PlatformBrand /></Link>
      <nav className="platform-nav" aria-label="Plataforma">
        <NavLink to="/tiendas">Tiendas</NavLink>
        <NavLink to="/planes">Planes</NavLink>
        <NavLink to="/crear-tienda">Abre tu tienda</NavLink>
      </nav>
      <div className="header-actions">{user ? <RoleLink role={user.role} /> : <><Link className="button secondary small" to="/login">Ingresar</Link><Link className="button primary small" to="/registro">Crear cuenta</Link></>}</div>
    </header>
    <Outlet />
    <footer className="platform-footer">
      <PlatformBrand showTagline />
      <nav aria-label="Enlaces de la plataforma"><Link to="/tiendas">Tiendas</Link><Link to="/planes">Planes</Link><Link to="/registro">Crear cuenta</Link></nav>
      <span>© 2026 {PLATFORM_NAME} · {PLATFORM_TAGLINE}</span>
    </footer>
  </PlatformTheme>;
}

/** Pantallas de la plataforma para usuarios con sesión (p. ej. /elegir-empresa). */
export function PlatformAppShell() {
  const user = useAuthStore((state) => state.user); const logout = useLogout();
  return <PlatformTheme>
    <header className="platform-header">
      <Link to="/" aria-label={`${PLATFORM_NAME}: inicio`}><PlatformBrand /></Link>
      <div className="header-actions">{user ? <span className="header-user">{user.firstName} {user.lastName}</span> : null}<button className="button secondary small" type="button" onClick={logout}>Cerrar sesión</button></div>
    </header>
    <Outlet />
  </PlatformTheme>;
}

export function CustomerShell() {
  const user = useAuthStore((state) => state.user); const logout = useLogout(); const brand = useStorefrontBrand();
  return <TenantTheme brand={brand}><SidebarFrame title={brand?.name ?? PLATFORM_NAME} sidebar={<>
    <Link to={brand ? `/t/${brand.slug}` : "/tiendas"} aria-label="Inicio de la tienda"><Brand variant="mark" brand={brand} /></Link>
    <div className="sidebar-user"><span>Cliente</span><strong>{user ? `${user.firstName} ${user.lastName}` : ""}</strong></div>
    <nav aria-label="Mi cuenta"><NavItems items={customerNav} /></nav>
    <Link className="nav-link" to="/tiendas">Cambiar de tienda</Link>
    <button className="nav-button" type="button" onClick={logout}>Cerrar sesión</button>
  </>}><Outlet /></SidebarFrame></TenantTheme>;
}

export function OperationsShell({ role }: { role: "ADMIN" | "STORE_MANAGER" }) {
  const user = useAuthStore((state) => state.user); const logout = useLogout(); const navigate = useNavigate();
  const companies = useCompanyStore((state) => state.companies); const adminCompanyId = useCompanyStore((state) => state.adminCompanyId);
  const selectAdmin = useCompanyStore((state) => state.selectAdmin); const managerCompany = useCompanyStore((state) => state.managerCompany);
  const items = role === "ADMIN" ? adminNav : managerNav; const brand = useOperationalBrand(role); const location = useLocation();
  const ownCompanies = useQuery({ queryKey: ["admin-companies"], queryFn: veloraApi.adminCompanies, enabled: role === "ADMIN", staleTime: 60_000 });
  const manyCompanies = (ownCompanies.data?.length ?? 0) >= 2;
  // "Inteligencia" (ML) solo en MAX: el menú lo marca bloqueado; el backend igual responde 403.
  const plan = useQuery({ queryKey: ["admin-plan"], queryFn: veloraApi.adminPlan, enabled: role === "ADMIN", staleTime: 60_000 });
  const locked: Record<string, string> = plan.data && !plan.data.effectivePlan.reports.canMlDashboards ? { "/admin/ml": "MAX" } : {};
  if (role === "ADMIN" && manyCompanies && !ownCompanies.data?.some((company) => company.id === adminCompanyId)) return <Navigate to={chooseCompanyPath(`${location.pathname}${location.search}`)} replace />;
  const noCompanies = role === "ADMIN" && ownCompanies.data?.length === 0;
  const allowedWithoutCompany = location.pathname.startsWith("/admin/empresas") || location.pathname.startsWith("/admin/mi-plan");
  // Cambiar de empresa conserva la sección actual (sin parámetros de la empresa anterior).
  const switchCompany = (id: string) => { selectAdmin(id); navigate(equivalentOwnerPath(location.pathname), { replace: true }); };
  return <SidebarFrame ops title={brand?.name ?? PLATFORM_NAME} sidebar={<>
    <Link to={role === "ADMIN" ? "/admin" : "/sucursal"} aria-label="Inicio del panel"><Brand variant="mark" brand={brand} tone="dark" /></Link>
    <div className="sidebar-user"><span>{role === "ADMIN" ? "Propietario" : "Encargado de sucursal"}</span><strong>{user ? `${user.firstName} ${user.lastName}` : ""}</strong>{user?.storeName ? <small>{user.storeName}</small> : null}</div>
    {role === "ADMIN"
      ? <label className="sidebar-select">Empresa<select value={adminCompanyId ?? ""} onChange={(event) => switchCompany(event.target.value)}><option value="" disabled>Elige una empresa</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.brand?.name ?? company.displayName ?? company.name}</option>)}</select>{manyCompanies ? <Link className="switch-company" to={chooseCompanyPath(location.pathname)}>Cambiar de empresa</Link> : null}</label>
      : <div className="sidebar-company">{managerCompany?.brand?.name ?? managerCompany?.name ?? "Empresa de la sucursal"}</div>}
    <SyncIndicator centerPath={role === "ADMIN" ? "/admin/sincronizacion" : "/sucursal/sincronizacion"} />
    <nav aria-label="Panel"><NavItems items={items} locked={locked} /></nav>
    <button className="nav-button" type="button" onClick={logout}>Cerrar sesión</button>
  </>}>{noCompanies && !allowedWithoutCompany ? <NoCompaniesNotice /> : <Outlet />}</SidebarFrame>;
}

/** Dueño sin empresas activas: en lugar de pantallas vacías, una acción clara. */
function NoCompaniesNotice() {
  return <section className="page centered">
    <span className="eyebrow">SIN EMPRESAS ACTIVAS</span>
    <h1>Aún no tienes una empresa activa</h1>
    <p>Crea tu primera empresa para cargar productos, abrir sucursales y vender. Si tenías una, puede estar desactivada: revisa tu plan.</p>
    <div className="actions"><Link className="button primary" to="/admin/empresas">Crear empresa</Link><Link className="button secondary" to="/admin/mi-plan">Ver mi plan</Link></div>
  </section>;
}

/** Área mínima de la plataforma (PLATFORM_ADMIN): marca de la plataforma, sin selector de empresa. */
export function PlatformShell() {
  const user = useAuthStore((state) => state.user); const logout = useLogout();
  return <SidebarFrame ops platform title={PLATFORM_NAME} sidebar={<>
    <Link to="/plataforma" aria-label={`${PLATFORM_NAME}: inicio`}><PlatformBrand variant="mark" tone="dark" /></Link>
    <div className="sidebar-user"><span>Plataforma {PLATFORM_NAME}</span><strong>{user ? `${user.firstName} ${user.lastName}` : ""}</strong></div>
    <nav aria-label="Plataforma"><NavItems items={[["Plataforma", "/plataforma"], ["Pagos", "/plataforma/pagos"], ["Cobros", "/plataforma/cobros"], ["Tiendas", "/tiendas"], ["Planes públicos", "/planes"]] as const} /></nav>
    <button className="nav-button" type="button" onClick={logout}>Cerrar sesión</button>
  </>}><PlatformTheme><Outlet /></PlatformTheme></SidebarFrame>;
}
