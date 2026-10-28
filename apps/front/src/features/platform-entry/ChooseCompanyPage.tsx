import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { afterCompanyChoicePath } from "@velora/contracts";
import { useQueries, useQuery } from "@tanstack/react-query";
import { veloraApi } from "../../core/api/veloraApi";
import { useCompanyStore } from "../../core/company/companyStore";
import { Notice } from "../../shared/feedback/Notice";

/** /elegir-empresa: el propietario con varias empresas elige con cuál operar (se recuerda la última). */
export function ChooseCompanyPage() {
  const navigate = useNavigate(); const [params] = useSearchParams();
  const last = useCompanyStore((state) => state.adminCompanyId);
  const select = useCompanyStore((state) => state.selectAdmin);
  const companies = useQuery({ queryKey: ["admin-companies"], queryFn: veloraApi.adminCompanies });
  const plan = useQuery({ queryKey: ["admin-plan"], queryFn: veloraApi.adminPlan });
  const stores = useQueries({ queries: (companies.data ?? []).map((company) => ({ queryKey: ["admin-stores", company.id], queryFn: () => veloraApi.adminStores(company.id) })) });

  // Vuelve a la sección del panel que se pedía antes de elegir (o al resumen).
  const enter = (id: string) => { select(id); navigate(afterCompanyChoicePath(params.get("from")), { replace: true }); };
  return (
    <main className="platform-main">
      <div className="directory-head">
        <span className="eyebrow">TUS EMPRESAS</span>
        <h1>¿Con qué empresa quieres trabajar?</h1>
        <p>Cada empresa tiene su marca, catálogo, sucursales y reportes. Puedes cambiar de empresa en cualquier momento desde el menú.</p>
      </div>
      {companies.isError ? <Notice kind="error">No se pudieron cargar tus empresas.</Notice> : null}
      {companies.isLoading ? <div className="choose-grid" aria-busy="true">{[0, 1].map((key) => <article key={key} className="choose-card skeleton-card" />)}</div> : null}
      {companies.data && companies.data.length === 0 ? <Notice>Todavía no tienes empresas activas. <Link className="text-link" to="/admin/empresas">Crear mi primera empresa</Link></Notice> : null}
      <div className="choose-grid">
        {companies.data?.map((company, index) => {
          const brand = company.brand;
          const branches = stores[index]?.data;
          return (
            <article key={company.id} className={`choose-card${company.id === last ? " last" : ""}`}>
              <header>
                <span className="store-logo" style={{ background: brand?.palette.primary ?? "var(--accent)" }}>{brand?.logoUrl ? <img src={brand.logoUrl} alt="" /> : (brand?.name ?? company.name).slice(0, 1)}</span>
                <div><strong>{brand?.name ?? company.name}</strong>{company.id === last ? <div className="plan-pill">Última usada</div> : null}</div>
              </header>
              <dl>
                <dt>Plan</dt><dd>{plan.data ? <span className="plan-pill">{plan.data.effectivePlan.name}</span> : "…"}</dd>
                <dt>Sucursales</dt><dd>{branches ? branches.filter((store) => store.active).length : "…"}</dd>
                <dt>Tienda</dt><dd>/t/{brand?.slug ?? company.slug}</dd>
              </dl>
              <button className="button primary" type="button" onClick={() => enter(company.id)}>Entrar</button>
            </article>
          );
        })}
      </div>
    </main>
  );
}
