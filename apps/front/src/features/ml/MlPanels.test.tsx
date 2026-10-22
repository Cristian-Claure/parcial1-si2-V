import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MlRun } from "@velora/contracts";
import { CancelRiskPanel, ForecastPanel, RunState } from "./MlPanels";

const run = (overrides: Partial<MlRun>): MlRun => ({
  id: "10000000-0000-4000-8000-000000000001", companyId: "10000000-0000-4000-8000-000000000002", modelKey: "SALES_FORECAST", status: "SUCCEEDED",
  rowsUsed: 400, dataFrom: "2025-07-01", dataTo: "2026-10-20", metrics: {}, params: {}, artifactVersion: "v1", error: null,
  createdAt: "2026-10-21T10:00:00.000Z", startedAt: null, finishedAt: "2026-10-21T10:01:00.000Z", ...overrides,
});

describe("paneles de ML", () => {
  it("muestra el estado vacío y el de datos insuficientes", () => {
    const { rerender } = render(<RunState run={null} label="Pronóstico" />);
    expect(screen.getByText(/Aún no hay resultados de pronóstico/)).toBeInTheDocument();
    rerender(<RunState run={run({ status: "INSUFFICIENT_DATA", error: "Se necesitan al menos 330 días de ventas." })} label="Pronóstico" />);
    expect(screen.getByText("Datos insuficientes")).toBeInTheDocument();
    expect(screen.getByText(/330 días/)).toBeInTheDocument();
  });

  it("pronóstico: métricas frente a referencias, gráfico con banda e importancias en español", () => {
    const metrics = {
      selected: { name: "HistGradientBoosting" }, best_baseline: "moving_average_28", beats_baselines: true, interval: { coverage_test: 0.78 },
      validation: { folds: [{}, {}, {}] }, importances: [{ feature: "dow", importance: 240 }],
      test: { days: 90, from: "2026-07-23", to: "2026-10-20", model: { mae: 2731.76, rmse: 3668, smape: 36.1 }, alternative: { name: "Ridge (lineal regularizado)", mae: 2469, rmse: 3187, smape: 32.4 },
        baselines: { naive: { mae: 3174, rmse: 4278, smape: 43.6 }, seasonal_naive_7: { mae: 3068, rmse: 3994, smape: 39.5 }, moving_average_28: { mae: 2820.97, rmse: 3532, smape: 36.8 } } },
    };
    const points = [
      { day: "2026-10-19", kind: "BACKTEST" as const, actual: 100, predicted: 90, lower: 70, upper: 120 },
      { day: "2026-10-21", kind: "FORECAST" as const, actual: null, predicted: 110, lower: 80, upper: 140 },
    ];
    const { container } = render(<ForecastPanel data={{ run: run({ metrics }), points }} />);
    expect(screen.getByText("Promedio móvil 28 días")).toBeInTheDocument();
    expect(screen.getByText("Día de la semana")).toBeInTheDocument();
    expect(screen.getByText(/supera a la mejor referencia/)).toBeInTheDocument();
    expect(container.querySelector("path.ml-band")).not.toBeNull();
    expect(container.querySelectorAll("path.ml-line")).toHaveLength(2);
  });

  it("riesgo de cancelación: matriz de confusión y pedidos abiertos", () => {
    const metrics = {
      selected: { name: "HistGradientBoosting" }, beats_baselines: true, prevalence: { test: 0.13 }, open_orders: 1, split: { test: 100, train_until: "2026-08-09", test_from: "2026-08-10" },
      test: { model: { roc_auc: 0.62, pr_auc: 0.24, precision: 0.17, recall: 0.65, f1: 0.27, brier: 0.2, threshold: 0.5, confusion: { tn: 60, fp: 27, fn: 4, tp: 9 } }, logistic: { roc_auc: 0.6 }, majority: { roc_auc: 0.5 } },
      importances: [{ feature: "fulfillment_type", importance: 0.08 }], cancel_rate_by_fulfillment: { DELIVERY: 0.159, PICKUP: 0.07 },
    };
    render(<CancelRiskPanel data={{ run: run({ modelKey: "CANCEL_RISK", metrics }), orders: [{ orderId: "10000000-0000-4000-8000-000000000009", orderNumber: "ORD-1", createdAt: "2026-10-20T15:00:00.000Z", total: 750, probability: 0.61, riskLevel: "ALTO", features: { fulfillment_type: "DELIVERY", payment_method: "COD" } }] }} />);
    expect(screen.getByText("cancelaciones detectadas")).toBeInTheDocument();
    expect(screen.getByText("ORD-1")).toBeInTheDocument();
    expect(screen.getByText("Contra entrega")).toBeInTheDocument();
    expect(screen.getAllByText("Tipo de entrega").length).toBeGreaterThan(0);
  });
});
