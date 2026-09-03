export type ReportKpiFormat =
  | 'CURRENCY'
  | 'COUNT';

export type ReportChartType =
  | 'LINE'
  | 'BAR'
  | 'DONUT';

export interface ReportKpi {
  key: string;
  label: string;
  value: number;
  format: ReportKpiFormat;
  helper: string;
}

export interface ReportChartSeries {
  name: string;
  data: number[];
}

export interface ReportChart {
  id: string;
  title: string;
  type: ReportChartType;
  categories: string[];
  series: ReportChartSeries[];
}

export interface ReportTable {
  id: string;
  title: string;
  columns: string[];
  rows: string[][];
}

export interface ReportPeriodBounds {
  minDate: string;
  maxDate: string;
}

export interface ReportOverview {
  title: string;
  scopeLabel: string;
  from: string;
  to: string;
  generatedAt: string;
  kpis: ReportKpi[];
  charts: ReportChart[];
  tables: ReportTable[];
  deterministicInsights: string[];
}

export type ReportFocus =
  | 'OVERVIEW'
  | 'SALES'
  | 'ORDERS'
  | 'PAYMENTS'
  | 'INVENTORY'
  | 'PRODUCTS';

export type ReportChartPreference =
  | 'AUTO'
  | 'LINE'
  | 'BAR'
  | 'DONUT'
  | 'TABLE';

export interface ReportAiIntent {
  focus: ReportFocus;
  fromDate: string | null;
  toDate: string | null;
  storeId: string | null;
  requestedChart: ReportChartPreference;
}

export interface ReportAiQueryResponse {
  question: string;
  intent: ReportAiIntent;
  report: ReportOverview;
  narrative: ReportAiNarrativeResponse;
  model: string;
}

export interface ReportAiNarrativeRequest {
  question: string;
  fromDate: string | null;
  toDate: string | null;
  storeId: string | null;
}

export interface ReportAiNarrativeResponse {
  summary: string;
  insights: string[];
  assessment: string;
  recommendations: string[];
  model: string;
}