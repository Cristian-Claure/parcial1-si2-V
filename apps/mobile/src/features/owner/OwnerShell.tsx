import type { ReactNode } from "react";
import { useAuthStore } from "@/core/auth/authStore";
import { useOwnerCompany } from "@/core/company/ownerStore";
import { useLoadedManagerCompany } from "@/features/operations/useManagerCompany";
import { OperationsShell, type OperationsNavKey } from "@/features/operations/OperationsShell";
import { BottomNav, CompanyBrand, PlatformBrand, Screen, type NavItem } from "@/shared/ui";
import type { PanelRole } from "@/core/api/ownerApi";

export type OwnerNavKey = "dashboard" | "orders" | "inventory" | "catalog" | "more";

const ownerNav: NavItem<OwnerNavKey>[] = [
  { key: "dashboard", label: "Resumen", href: "/owner/dashboard" },
  { key: "orders", label: "Pedidos", href: "/owner/orders" },
  { key: "inventory", label: "Inventario", href: "/owner/inventory" },
  { key: "catalog", label: "Catálogo", href: "/owner/catalog" },
  { key: "more", label: "Más", href: "/owner/more" },
];

/** Shell del propietario: marca de la empresa activa (con su paleta) y navegación inferior. */
export function OwnerShell({ active, children, refreshing, onRefresh, scroll = true }: { active?: OwnerNavKey; children: ReactNode; refreshing?: boolean; onRefresh?: () => void; scroll?: boolean }) {
  const company = useOwnerCompany();
  const header = company
    ? <CompanyBrand company={{ name: company.brand?.name ?? company.name, slug: company.brand?.slug ?? company.slug, logoUrl: company.brand?.logoUrl ?? null }} subtitle="Panel del propietario" />
    : <PlatformBrand showTagline={false} />;
  return (
    <Screen header={header} scroll={scroll} refreshing={refreshing} onRefresh={onRefresh} footer={<BottomNav items={ownerNav} active={active} />}>
      {children}
    </Screen>
  );
}

export interface PanelContext {
  role: PanelRole;
  companyId: string | null;
  companyName: string | null;
}

/** Rol y empresa del panel: la empresa elegida por el propietario o la de la sucursal del encargado. */
export function usePanelContext(): PanelContext {
  const role = useAuthStore((state) => state.user?.role);
  const owner = useOwnerCompany();
  // Sin disparar cargas: el layout de cada grupo carga su empresa (owner o encargado).
  const manager = useLoadedManagerCompany();
  if (role === "ADMIN") return { role: "ADMIN", companyId: owner?.id ?? null, companyName: owner?.brand?.name ?? owner?.name ?? null };
  return { role: "STORE_MANAGER", companyId: manager?.id ?? null, companyName: manager?.brand?.name ?? manager?.name ?? null };
}

/** Pantallas compartidas (pedidos e inventario): shell del propietario o del Modo operaciones. */
export function PanelShell({ owner, manager, children, refreshing, onRefresh }: { owner: OwnerNavKey; manager: OperationsNavKey; children: ReactNode; refreshing?: boolean; onRefresh?: () => void }) {
  const role = useAuthStore((state) => state.user?.role);
  if (role === "ADMIN") return <OwnerShell active={owner} refreshing={refreshing} onRefresh={onRefresh}>{children}</OwnerShell>;
  return <OperationsShell active={manager} refreshing={refreshing} onRefresh={onRefresh}>{children}</OperationsShell>;
}
