import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import type { UserRole } from "@velora/contracts";
import { useAuthStore } from "../../core/auth/authStore";
import { useCompanyStore } from "../../core/company/companyStore";

const customerNav = [
  ["Catálogo", "/catalogo"], ["Probador", "/probador"], ["Favoritos", "/favoritos"], ["Mi bolsa", "/bolsa"], ["Mis pedidos", "/mis-pedidos"], ["Mi cuenta", "/mi-cuenta"],
] as const;
const adminNav = [
  ["Dashboard", "/admin"], ["Catálogo", "/admin/catalogo"], ["Inventario", "/admin/inventario"], ["Pedidos", "/admin/pedidos"],
  ["POS", "/admin/pos"], ["Reportes", "/admin/reportes"], ["Auditoría", "/admin/auditoria"],
] as const;
const managerNav = [
  ["Sucursal", "/sucursal"], ["Catálogo", "/sucursal/catalogo"], ["Inventario", "/sucursal/inventario"], ["Pedidos", "/sucursal/pedidos"],
  ["POS", "/sucursal/pos"], ["Reportes", "/sucursal/reportes"],
] as const;

function NavItems({ items }: { items: readonly (readonly [string, string])[] }) {
  return <>{items.map(([label, to]) => <NavLink key={to} to={to} className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>{label}</NavLink>)}</>;
}

export function PublicShell() {
  const user = useAuthStore((state) => state.user);
  return <><header className="public-header"><Link className="brand" to="/">VÉLORA</Link><nav><NavLink to="/catalogo">Catálogo</NavLink>{user?.role === "CUSTOMER" ? <NavLink to="/bolsa">Mi bolsa</NavLink> : null}</nav><div className="header-actions">{user ? <RoleLink role={user.role} /> : <><Link to="/login">Ingresar</Link><Link className="button small" to="/registro">Crear cuenta</Link></>}</div></header><Outlet /><footer className="public-footer"><strong>VÉLORA</strong><span>Comercio omnicanal · Santa Cruz de la Sierra</span></footer></>;
}

function RoleLink({ role }: { role: UserRole }) {
  const to = role === "ADMIN" ? "/admin" : role === "STORE_MANAGER" ? "/sucursal" : "/mis-pedidos";
  return <Link className="button small" to={to}>Mi espacio</Link>;
}

export function CustomerShell() {
  const user = useAuthStore((state) => state.user); const logout = useAuthStore((state) => state.logout); const navigate = useNavigate();
  return <div className="app-shell"><aside className="sidebar"><Link className="brand inverted" to="/">VÉLORA</Link><div className="sidebar-user"><span>Cliente</span><strong>{user ? `${user.firstName} ${user.lastName}` : ""}</strong></div><nav><NavItems items={customerNav} /></nav><button className="nav-button" type="button" onClick={() => { logout(); navigate("/"); }}>Cerrar sesión</button></aside><main className="app-content"><Outlet /></main></div>;
}

export function OperationsShell({ role }: { role: "ADMIN" | "STORE_MANAGER" }) {
  const user = useAuthStore((state) => state.user); const logout = useAuthStore((state) => state.logout); const navigate = useNavigate();
  const companies = useCompanyStore((state) => state.companies); const adminCompanyId = useCompanyStore((state) => state.adminCompanyId);
  const selectAdmin = useCompanyStore((state) => state.selectAdmin); const managerCompany = useCompanyStore((state) => state.managerCompany);
  const items = role === "ADMIN" ? adminNav : managerNav;
  return <div className="app-shell"><aside className="sidebar ops"><Link className="brand inverted" to="/">VÉLORA</Link><div className="sidebar-user"><span>{role === "ADMIN" ? "Administración" : "Encargado de sucursal"}</span><strong>{user ? `${user.firstName} ${user.lastName}` : ""}</strong>{user?.storeName ? <small>{user.storeName}</small> : null}</div>{role === "ADMIN" ? <label className="sidebar-select">Compañía<select value={adminCompanyId ?? ""} onChange={(event) => selectAdmin(event.target.value)}><option value="" disabled>Seleccione</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label> : <div className="sidebar-company">{managerCompany?.name ?? "Compañía de la sucursal"}</div>}<nav><NavItems items={items} /></nav><button className="nav-button" type="button" onClick={() => { logout(); navigate("/"); }}>Cerrar sesión</button></aside><main className="app-content"><Outlet /></main></div>;
}
