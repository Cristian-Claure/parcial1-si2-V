/** Constantes de presentación compartidas por los gráficos y paneles de ML. */

// Segmentos con la serie armónica de la tienda (deriveTheme); 7.º y 8.º son variantes de la misma serie.
export const SEGMENT_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)", "color-mix(in srgb, var(--chart-1) 60%, var(--ink))", "color-mix(in srgb, var(--chart-4) 60%, var(--ink))"];

const FEATURE_LABELS: Record<string, string> = {
  dow: "Día de la semana", month: "Mes", day_of_month: "Día del mes", quincena: "Quincena", month_end: "Fin de mes",
  lag_1: "Venta de ayer", lag_7: "Venta hace 7 días", lag_14: "Venta hace 14 días", lag_28: "Venta hace 28 días",
  ma_7: "Promedio 7 días", ma_28: "Promedio 28 días", trend: "Tendencia",
  fathers_pre: "Previa Día del Padre", fathers_day: "Día del Padre", mothers_pre: "Previa Día de la Madre", mothers_day: "Día de la Madre",
  black_friday: "Black Friday", bf_weekend: "Fin de semana Black Friday", xmas_season: "Temporada navideña", xmas_eve: "Nochebuena", xmas_day: "Navidad",
  fulfillment_type: "Tipo de entrega", payment_method: "Método de pago", total: "Total del pedido", discount: "Descuento", n_lines: "Líneas del pedido",
  units: "Unidades", hour: "Hora", tenure_days: "Antigüedad del cliente", prior_orders: "Pedidos previos del cliente",
};

export const featureLabel = (key: string) => FEATURE_LABELS[key] ?? key;
