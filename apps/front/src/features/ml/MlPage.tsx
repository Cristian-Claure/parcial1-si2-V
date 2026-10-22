import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MlOverview, MlRunStatus } from "@velora/contracts";
import { ApiClientError } from "../../core/api/apiClient";
import { useCompanyStore } from "../../core/company/companyStore";
import { Notice } from "../../shared/feedback/Notice";
import { mlApi } from "./mlApi";
import { AnomaliesPanel, CancelRiskPanel, ForecastPanel, SegmentsPanel } from "./MlPanels";
import "./ml.css";

const TABS = [
  { id: "forecast", label: "Pronóstico", model: "SALES_FORECAST" },
  { id: "segments", label: "Segmentos", model: "CUSTOMER_SEGMENTS" },
  { id: "risk", label: "Riesgo de cancelación", model: "CANCEL_RISK" },
  { id: "anomalies", label: "Anomalías", model: "SALES_ANOMALIES" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const STATUS_LABEL: Record<MlRunStatus, string> = { QUEUED: "En cola", RUNNING: "Entrenando", SUCCEEDED: "Listo", FAILED: "Falló", INSUFFICIENT_DATA: "Datos insuficientes" };
const planLocked = (error: unknown) => error instanceof ApiClientError && error.status === 403 && error.code === "PLAN_LIMIT_REPORT_FEATURE";
const message = (error: unknown) => (error instanceof Error ? error.message : "No fue posible completar la acción.");

/** Inteligencia (Fase 4): dashboards de los modelos entrenados con el historial de la tienda. Solo MAX. */
export function MlPage() {
  const companyId = useCompanyStore((state) => state.adminCompanyId);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabId>("forecast");
  const [notice, setNotice] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);
  const wasTraining = useRef(false);

  const overview = useQuery({
    queryKey: ["ml-overview", companyId],
    queryFn: () => mlApi.overview(companyId!),
    enabled: Boolean(companyId),
    retry: (failures, error) => !planLocked(error) && failures < 1,
    // Seguimiento del entrenamiento: un solo sondeo espaciado mientras haya corridas activas.
    refetchInterval: (query) => ((query.state.data as MlOverview | undefined)?.training ? 5000 : false),
  });
  const ready = Boolean(companyId) && overview.isSuccess;
  const forecast = useQuery({ queryKey: ["ml-forecast", companyId], queryFn: () => mlApi.forecast(companyId!), enabled: ready && tab === "forecast" });
  const segments = useQuery({ queryKey: ["ml-segments", companyId], queryFn: () => mlApi.segments(companyId!), enabled: ready && tab === "segments" });
  const risk = useQuery({ queryKey: ["ml-risk", companyId], queryFn: () => mlApi.cancelRisk(companyId!), enabled: ready && tab === "risk" });
  const anomalies = useQuery({ queryKey: ["ml-anomalies", companyId], queryFn: () => mlApi.anomalies(companyId!), enabled: ready && tab === "anomalies" });

  const training = overview.data?.training ?? false;
  useEffect(() => {
    if (wasTraining.current && !training) {
      setNotice({ kind: "success", text: "Entrenamiento terminado. Los tableros muestran los nuevos resultados." });
      for (const key of ["ml-forecast", "ml-segments", "ml-risk", "ml-anomalies"]) void queryClient.invalidateQueries({ queryKey: [key, companyId] });
    }
    wasTraining.current = training;
  }, [training, companyId, queryClient]);

  const retrain = useMutation({
    mutationFn: () => mlApi.start(companyId!),
    onSuccess: async () => {
      setNotice({ kind: "info", text: "Entrenamiento en curso con el historial de la tienda. Suele tardar menos de un minuto." });
      await queryClient.invalidateQueries({ queryKey: ["ml-overview", companyId] });
    },
    onError: (error) => setNotice({ kind: "error", text: message(error) }),
  });

  const heading = (
    <div className="page-heading report-heading">
      <div>
        <span className="eyebrow">INTELIGENCIA · MACHINE LEARNING</span>
        <h1>Lo que tus datos anticipan</h1>
        <p>Modelos entrenados solo con el historial de esta tienda: pronóstico de ventas, segmentos de clientes, riesgo de cancelación y días atípicos.</p>
      </div>
      {overview.isSuccess ? (
        <button className="button primary" type="button" disabled={training || retrain.isPending || !overview.data.service.available} onClick={() => retrain.mutate()}>
          {training ? "Entrenando…" : "Entrenar de nuevo"}
        </button>
      ) : null}
    </div>
  );

  if (!companyId) return <section className="page ml-page">{heading}<Notice>Selecciona una compañía en el menú lateral.</Notice></section>;
  if (overview.isError) {
    return (
      <section className="page ml-page">
        {heading}
        {planLocked(overview.error) ? (
          <article className="ml-locked">
            <span className="ml-locked-badge">Disponible en MAX</span>
            <h2>Inteligencia con Machine Learning</h2>
            <p>Pronóstico de ventas a 30 días, segmentos de clientes, riesgo de cancelación de pedidos y detección de días atípicos, entrenados con el historial de tu tienda.</p>
            <Link className="button primary" to="/admin/mi-plan">Mejorar a MAX</Link>
          </article>
        ) : <Notice kind="error">{message(overview.error)}</Notice>}
      </section>
    );
  }
  if (!overview.data) return <section className="page ml-page">{heading}<p className="report-empty">Cargando…</p></section>;

  const current = TABS.find((item) => item.id === tab)!;
  const panel = {
    forecast: forecast.data ? <ForecastPanel data={forecast.data} /> : null,
    segments: segments.data ? <SegmentsPanel data={segments.data} /> : null,
    risk: risk.data ? <CancelRiskPanel data={risk.data} /> : null,
    anomalies: anomalies.data ? <AnomaliesPanel data={anomalies.data} /> : null,
  }[tab];
  const loading = { forecast, segments, risk, anomalies }[tab];

  return (
    <section className="page ml-page">
      {heading}
      {!overview.data.service.available ? <Notice kind="info">El servicio de Machine Learning no está activo: se muestran los últimos resultados guardados. Para entrenar, inicia el servicio local (pnpm dev:ml).</Notice> : null}
      {notice ? <Notice kind={notice.kind === "info" ? "info" : notice.kind}>{notice.text}</Notice> : null}

      <div className="ml-status">
        {overview.data.models.map((model) => {
          const latest = model.latest;
          return (
            <button key={model.modelKey} type="button" className={`ml-status-item${current.model === model.modelKey ? " active" : ""}`} onClick={() => setTab(TABS.find((item) => item.model === model.modelKey)!.id)}>
              <span>{model.label}</span>
              <b className={`ml-badge ${latest ? latest.status.toLowerCase() : "none"}`}>{latest ? STATUS_LABEL[latest.status] : "Sin entrenar"}</b>
              <small>{model.lastSuccess?.finishedAt ? `Último éxito: ${new Date(model.lastSuccess.finishedAt).toLocaleString("es-BO")}` : "Aún sin resultados"}</small>
            </button>
          );
        })}
      </div>

      <div className="ml-tabs" role="tablist">
        {TABS.map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} type="button" className={`ml-tab${tab === item.id ? " active" : ""}`} onClick={() => setTab(item.id)}>{item.label}</button>)}
      </div>

      {loading.isError ? <Notice kind="error">{message(loading.error)}</Notice> : panel ?? <p className="report-empty">Cargando resultados…</p>}
    </section>
  );
}
