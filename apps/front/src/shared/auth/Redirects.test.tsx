import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import type { UserProfile } from "@velora/contracts";
import { useAuthStore } from "../../core/auth/authStore";
import { validateCustomerRegistration } from "../../features/auth/registerValidation";
import { paginate } from "../ui/Pagination/paginate";
import { RequireRole } from "./RouteGuards";

const customer: UserProfile = { id: "10000000-0000-4000-8000-000000000001", firstName: "Ana", lastName: "Cruz", email: "ana@example.com", role: "CUSTOMER", customerType: "B2C", phone: null, businessName: null, taxId: null, status: "ACTIVE", storeId: null, storeName: null };

/** Muestra la ruta y el estado con que se llegó al login. */
function LoginProbe() {
  const location = useLocation();
  const state = location.state as { from?: string; expired?: boolean } | null;
  return <div>LOGIN from={state?.from ?? "-"} expired={String(state?.expired ?? false)}</div>;
}

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/login" element={<LoginProbe />} />
    <Route path="/tiendas" element={<div>DIRECTORIO</div>} />
    <Route path="/admin/*" element={<RequireRole roles={["ADMIN"]}><div>PANEL</div></RequireRole>} />
  </Routes></MemoryRouter>);
}

beforeEach(() => useAuthStore.setState({ status: "anonymous", accessToken: null, user: null, sessionExpired: false }));

describe("redirecciones web (Fase 4C)", () => {
  it("sin sesión en una ruta protegida → login con from (incluida la query)", () => {
    renderAt("/admin/inventario?nivel=bajo");
    expect(screen.getByText("LOGIN from=/admin/inventario?nivel=bajo expired=false")).toBeInTheDocument();
  });

  it("sesión expirada (401) → login con aviso", () => {
    useAuthStore.setState({ status: "authenticated", accessToken: "x", user: customer });
    useAuthStore.getState().expire();
    renderAt("/admin/pedidos");
    expect(screen.getByText("LOGIN from=/admin/pedidos expired=true")).toBeInTheDocument();
  });

  it("un cliente que entra a /admin va al directorio", () => {
    useAuthStore.setState({ status: "authenticated", accessToken: "x", user: customer });
    renderAt("/admin");
    expect(screen.getByText("DIRECTORIO")).toBeInTheDocument();
  });
});

describe("validación del registro en español", () => {
  it("marca cada campo con un mensaje claro", () => {
    const errors = validateCustomerRegistration({ firstName: " ", lastName: "Cruz", email: "ana@", password: "abc" });
    expect(errors.firstName).toBe("Escribe tu nombre.");
    expect(errors.lastName).toBeUndefined();
    expect(errors.email).toMatch(/correo válido/);
    expect(errors.password).toMatch(/8 caracteres/);
    expect(validateCustomerRegistration({ firstName: "Ana", lastName: "Cruz", email: "ana@correo.com", password: "Segura2026" })).toEqual({});
  });
});

describe("paginación", () => {
  it("acota la página al rango", () => {
    const items = Array.from({ length: 45 }, (_, index) => index);
    expect(paginate(items, 1, 20)).toMatchObject({ page: 1, pageCount: 3 });
    expect(paginate(items, 9, 20).items).toEqual([40, 41, 42, 43, 44]);
    expect(paginate([], 3, 20)).toMatchObject({ page: 1, pageCount: 1, items: [] });
  });
});
