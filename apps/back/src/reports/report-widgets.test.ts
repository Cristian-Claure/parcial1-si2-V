import { describe, expect, it } from "vitest";
import type { ReportOverview } from "@velora/contracts";
import { REPORT_WIDGETS, applyReportTier, widgetMinTier } from "./report-widgets.js";

const overview: ReportOverview = {
  title: "x", scopeLabel: "x", from: "2026-10-01", to: "2026-10-21", generatedAt: new Date().toISOString(),
  kpis: REPORT_WIDGETS.filter((widget) => widget.kind === "KPI").map((widget) => ({ key: widget.id, label: widget.title, value: 1, format: "COUNT", helper: "" })),
  charts: REPORT_WIDGETS.filter((widget) => widget.kind === "CHART").map((widget) => ({ id: widget.id, title: widget.title, type: "bar", categories: [], series: [] }) as never),
  tables: [{ id: "top-products", title: "Top", columns: ["a"], rows: Array.from({ length: 10 }, (_, index) => [String(index)]) }],
  deterministicInsights: [],
};
const required = { BASIC: "FREE", STANDARD: "PLUS", ADVANCED: "MAX" } as const;

describe("applyReportTier", () => {
  it("BASIC solo recibe widgets BASIC, top 5 y el resto bloqueado con el plan requerido", () => {
    const result = applyReportTier(overview, "BASIC", (tier) => required[tier]);
    expect(result.kpis.every((kpi) => kpi.minTier === "BASIC")).toBe(true);
    expect(result.tables[0]?.rows).toHaveLength(5);
    expect(result.locked?.every((widget) => widget.minTier !== "BASIC")).toBe(true);
    expect(result.locked?.find((widget) => widget.id === "sales-store")?.requiredPlan).toBe("PLUS");
  });

  it("ADVANCED no tiene bloqueados y conserva todas las filas", () => {
    const result = applyReportTier(overview, "ADVANCED", (tier) => required[tier]);
    expect(result.locked).toEqual([]);
    expect(result.kpis).toHaveLength(overview.kpis.length);
    expect(result.tables[0]?.rows).toHaveLength(10);
  });

  it("un widget sin clasificar se trata como ADVANCED (falla cerrada)", () => {
    expect(widgetMinTier("NUEVO_WIDGET")).toBe("ADVANCED");
  });
});
