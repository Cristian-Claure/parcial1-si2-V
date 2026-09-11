import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "../../core/auth/authStore";
import { RequireRole } from "./RouteGuards";
beforeEach(() => useAuthStore.setState({ status: "anonymous", accessToken: null, user: null }));
describe("RequireRole", () => {
  it("redirige a login a un visitante", () => { render(<MemoryRouter initialEntries={["/privado"]}><Routes><Route path="/login" element={<div>LOGIN</div>} /><Route path="/privado" element={<RequireRole roles={["CUSTOMER"]}><div>PRIVADO</div></RequireRole>} /></Routes></MemoryRouter>); expect(screen.getByText("LOGIN")).toBeInTheDocument(); });
  it("permite a CUSTOMER en su ruta", () => { useAuthStore.setState({ status: "authenticated", accessToken: "x", user: { id: "10000000-0000-4000-8000-000000000001", firstName: "Ana", lastName: "Cruz", email: "ana@example.com", role: "CUSTOMER", customerType: "B2C", phone: null, businessName: null, taxId: null, status: "ACTIVE", storeId: null, storeName: null } }); render(<MemoryRouter initialEntries={["/privado"]}><Routes><Route path="/privado" element={<RequireRole roles={["CUSTOMER"]}><div>PRIVADO</div></RequireRole>} /></Routes></MemoryRouter>); expect(screen.getByText("PRIVADO")).toBeInTheDocument(); });
});
