import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import type { DirectoryEntry } from "@velora/contracts";
import { LoginPage, RegisterChooserPage } from "../auth/AuthPages";
import { RequireStorefront } from "../../shared/auth/RouteGuards";
import { useCompanyStore } from "../../core/company/companyStore";
import { StoreCard } from "./DirectoryPage";

const wrap = (node: React.ReactNode, path = "/") => render(
  <QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[path]}>{node}</MemoryRouter></QueryClientProvider>,
);

describe("entrada neutral de la plataforma Trama", () => {
  beforeEach(() => useCompanyStore.setState({ storefrontCompanyId: null }));

  it("el login no muestra ninguna tienda y ofrece crear cuenta y ver planes", () => {
    const { container } = wrap(<LoginPage />);
    expect(screen.getByRole("heading", { name: "Ingresar a Trama" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Crear cuenta" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Ver planes" }).length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/VÉLORA|VELORA/i);
    expect(container.querySelector("img")).toBeNull(); // sin fotos: solo SVG vectorial
  });

  it("crear cuenta ofrece los dos caminos", () => {
    wrap(<RegisterChooserPage />);
    expect(screen.getByRole("link", { name: /Soy cliente/ })).toHaveAttribute("href", "/registro/cliente");
    expect(screen.getByRole("link", { name: /Quiero abrir mi tienda/ })).toHaveAttribute("href", "/crear-tienda");
  });

  it("sin tienda elegida, las rutas de compra llevan al directorio", () => {
    wrap(<Routes><Route path="/tiendas" element={<div>DIRECTORIO</div>} /><Route path="/catalogo" element={<RequireStorefront><div>CATALOGO</div></RequireStorefront>} /></Routes>, "/catalogo");
    expect(screen.getByText("DIRECTORIO")).toBeInTheDocument();
  });

  it("cada tarjeta del directorio usa los colores de su tienda", () => {
    const entry: DirectoryEntry = { slug: "solana", name: "Solana", tagline: "Luz, lino y verano.", segment: "MUJER", logoUrl: null, bannerUrl: null,
      palette: { paper: "#FFF8EF", ink: "#24313A", primary: "#115E59", accent: "#B8432F", accentDeep: "#9A3826", accentSoft: "#F6E3DC", inkSoft: "#4B5A63", onAccent: "#FFFFFF" } };
    wrap(<StoreCard entry={entry} />);
    const card = screen.getByRole("link", { name: /Solana/ });
    expect(card).toHaveAttribute("href", "/t/solana");
    expect(card.style.getPropertyValue("--store-accent")).toBe("#B8432F");
    expect(screen.getByText("Moda mujer")).toBeInTheDocument();
  });
});
