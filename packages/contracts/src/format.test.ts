import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatMoney, formatNumberBo, labelFor, ORDER_STATUS_LABELS, stockLevel } from "./format.js";

describe("formatos es-BO", () => {
  it("dinero con miles y coma decimal", () => {
    expect(formatMoney(1234.5)).toBe("Bs 1.234,50");
    expect(formatMoney(0)).toBe("Bs 0,00");
    expect(formatMoney(1234567.891, "USD")).toBe("US$ 1.234.567,89");
    expect(formatMoney(-15)).toBe("Bs -15,00");
    expect(formatNumberBo(9876, 0)).toBe("9.876");
  });
  it("fechas dd/mm/aaaa", () => {
    expect(formatDate("2026-10-28")).toBe("28/10/2026");
    expect(formatDate(new Date(2026, 0, 5, 9, 7))).toBe("05/01/2026");
    expect(formatDateTime(new Date(2026, 0, 5, 9, 7))).toBe("05/01/2026 09:07");
    expect(formatDate(null)).toBe("—");
    expect(formatDate("no-es-fecha")).toBe("—");
  });
  it("etiquetas y semáforo de stock", () => {
    expect(labelFor(ORDER_STATUS_LABELS, "FULFILLED")).toBe("Entregado");
    expect(labelFor(ORDER_STATUS_LABELS, "OTRO")).toBe("OTRO");
    expect(stockLevel(0)).toBe("agotado");
    expect(stockLevel(3)).toBe("bajo");
    expect(stockLevel(30)).toBe("normal");
  });
});
