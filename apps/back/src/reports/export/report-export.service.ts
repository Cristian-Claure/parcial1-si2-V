import { Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import type { ReportBuilderDefinition, ReportBuilderResult, ReportExportFormat, ReportOverview } from "@velora/contracts";
import type { AuthPrincipal } from "../../auth/security.js";
import { BrandingService } from "../../companies/branding.service.js";
import { PlanLimitsService } from "../../plans/plan-limits.service.js";
import { ReportBuilderService } from "../builder/report-builder.service.js";
import { ReportsService } from "../reports.service.js";

export type CellFormat = "TEXT" | "CURRENCY" | "COUNT" | "PERCENT";

export interface ExportTable {
  title: string;
  columns: { label: string; format: CellFormat }[];
  rows: (string | number)[][];
  totals?: (string | number | null)[];
}

export interface ExportDocument {
  title: string;
  scopeLabel: string;
  period: string;
  details: [string, string][];
  filters: [string, string][];
  notes: string[];
  tables: ExportTable[];
}

export interface ExportedFile { buffer: Buffer; contentType: string; filename: string }

interface Brand { name: string; accent: string; ink: string; soft: string; logo: Buffer | null }

const CONTENT_TYPE: Record<ReportExportFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};
const XLSX_FORMAT: Record<CellFormat, string | undefined> = { TEXT: undefined, CURRENCY: '"Bs" #,##0.00', COUNT: "#,##0", PERCENT: '0.00"%"' };
const numberEs = (value: number, decimals: number) => new Intl.NumberFormat("es-BO", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);

/** Texto seguro para las fuentes estándar del PDF (WinAnsi: cubre tildes, ñ, ü, ¿, ¡, ·, —). */
const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
export function pdfSafe(text: string): string {
  return [...text].map((char) => (char.charCodeAt(0) <= 0xff || WIN_ANSI_EXTRA.includes(char) ? char : "?")).join("");
}

export function formatCell(value: string | number | null | undefined, format: CellFormat): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (format === "CURRENCY") return `Bs ${numberEs(value, 2)}`;
  if (format === "PERCENT") return `${numberEs(value, 2)} %`;
  if (format === "COUNT") return numberEs(value, Number.isInteger(value) ? 0 : 2);
  return String(value);
}

/**
 * Exportación en el backend con librerías ligeras (sin navegador headless):
 * - XLSX con exceljs: hoja "Resumen" (filtros y metadatos) y hojas de datos con formato,
 *   encabezado fijo, autofiltro y fila de totales.
 * - PDF con pdfkit: logo/monograma, nombre y colores de la empresa, filtros, tablas con
 *   totales y "Página X de Y". Fuentes estándar Helvetica/Times (WinAnsi: tildes y ñ).
 */
@Injectable()
export class ReportExportService {
  constructor(
    private readonly branding: BrandingService,
    private readonly reports: ReportsService,
    private readonly builder: ReportBuilderService,
    private readonly limits: PlanLimitsService,
  ) {}

  /** Resumen (widgets del nivel) exportado desde STANDARD; FREE recibe 403 PLAN_LIMIT_REPORT_FEATURE. */
  async exportOverview(principal: AuthPrincipal, companyId: string | null, storeId: string | null, from: string | null, to: string | null, format: ReportExportFormat): Promise<ExportedFile> {
    const context = await this.reports.reportContext(principal, companyId, storeId, null, null);
    await this.limits.assertReportFeature(context.scope.companyId, "EXPORT", 403);
    const overview = await this.reports.overview(principal, companyId, from, to, storeId);
    return this.render(context.scope.companyId, this.overviewDocument(overview), format, `${overview.title} ${context.scope.label}`);
  }

  async exportQuery(principal: AuthPrincipal, companyId: string | null, definition: ReportBuilderDefinition, format: ReportExportFormat): Promise<ExportedFile> {
    const context = await this.reports.reportContext(principal, companyId, null, null, null);
    await this.limits.assertReportFeature(context.scope.companyId, "EXPORT", 403);
    const run = await this.builder.run(principal, companyId, definition);
    return this.render(run.companyId, this.builderDocument(run.result), format, run.result.title);
  }

  async render(companyId: string, document: ExportDocument, format: ReportExportFormat, baseName: string): Promise<ExportedFile> {
    const brand = await this.brand(companyId);
    const buffer = format === "xlsx" ? await this.xlsx(document, brand) : await this.pdf(document, brand);
    const slug = baseName.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "reporte";
    return { buffer, contentType: CONTENT_TYPE[format], filename: `${slug}-${new Date().toISOString().slice(0, 10)}.${format}` };
  }

  // -------------------------------------------------------------------------
  // Documentos a partir de los resultados
  // -------------------------------------------------------------------------

  builderDocument(result: ReportBuilderResult): ExportDocument {
    const dims = result.columns.filter((column) => column.kind === "DIMENSION");
    const measures = result.columns.filter((column) => column.kind === "MEASURE");
    const withPrevious = result.rows.some((row) => row.previous);
    const columns = [
      ...dims.map((column) => ({ label: column.label, format: "TEXT" as const })),
      ...measures.map((column) => ({ label: column.label, format: (column.format ?? "COUNT") as CellFormat })),
      ...(withPrevious ? measures.map((column) => ({ label: `${column.label} (anterior)`, format: (column.format ?? "COUNT") as CellFormat })) : []),
    ];
    const rows = result.rows.map((row) => [...row.labels, ...row.values, ...(withPrevious ? row.previous!.map((value) => value ?? 0) : [])]);
    const totals = [...dims.map((_, index) => (index === 0 ? "Total" : "")), ...result.totals, ...(withPrevious ? result.previousTotals ?? measures.map(() => null) : [])];
    const details: [string, string][] = [["Alcance", result.scopeLabel], ["Período", `${result.from} a ${result.to}`]];
    if (result.previousFrom && result.previousTo) details.push(["Período anterior", `${result.previousFrom} a ${result.previousTo}`]);
    details.push(["Agrupaciones", dims.map((column) => column.label).join(", ") || "Sin agrupación"], ["Medidas", measures.map((column) => column.label).join(", ")]);
    if (result.previousTotals) {
      details.push(...measures.map((column, index): [string, string] => [`${column.label} · anterior`, formatCell(result.previousTotals![index], (column.format ?? "COUNT") as CellFormat)]));
    }
    details.push(["Filas", `${result.rows.length}${result.truncated ? " (limitado por el top N)" : ""}`], ["Nivel de reportes", result.policy.tier], ["Generado", new Date(result.generatedAt).toLocaleString("es-BO", { timeZone: "America/La_Paz" })]);
    return {
      title: result.title, scopeLabel: result.scopeLabel, period: `${result.from} a ${result.to}`, details,
      filters: result.filtersApplied.map((filter) => [filter.label, filter.values.join(", ")]),
      notes: result.notes,
      // Sin agrupaciones el resultado es una sola fila: los totales.
      tables: [dims.length ? { title: "Datos", columns, rows, totals } : { title: "Datos", columns, rows: [totals.map((value) => value ?? 0)] }],
    };
  }

  overviewDocument(overview: ReportOverview): ExportDocument {
    const kpiFormat = (format: string): CellFormat => (format === "CURRENCY" ? "CURRENCY" : format === "PERCENT" ? "PERCENT" : "COUNT");
    const kpis: ExportTable = {
      title: "Indicadores",
      columns: [{ label: "Indicador", format: "TEXT" }, { label: "Valor", format: "TEXT" }, { label: "Período anterior", format: "TEXT" }, { label: "Variación", format: "TEXT" }],
      rows: overview.kpis.map((kpi) => [
        kpi.label, formatCell(kpi.value, kpiFormat(kpi.format)),
        kpi.previousValue === undefined || kpi.previousValue === null ? "—" : formatCell(kpi.previousValue, kpiFormat(kpi.format)),
        kpi.changePct === undefined || kpi.changePct === null ? "—" : `${kpi.changePct > 0 ? "+" : ""}${numberEs(kpi.changePct, 1)} %`,
      ]),
    };
    const charts = overview.charts.map((chart): ExportTable => ({
      title: chart.title,
      columns: [{ label: chart.type === "HEATMAP" ? "Día" : "Categoría", format: "TEXT" }, ...(chart.type === "HEATMAP"
        ? chart.categories.map((hour) => ({ label: `${hour} h`, format: "COUNT" as const }))
        : chart.series.map((series) => ({ label: series.name, format: (/pedidos|unidades|stock/i.test(`${chart.title} ${series.name}`) ? "COUNT" : "CURRENCY") as CellFormat })))],
      rows: chart.type === "HEATMAP"
        ? chart.series.map((series) => [series.name, ...series.data])
        : chart.categories.map((category, index) => [category, ...chart.series.map((series) => series.data[index] ?? 0)]),
    }));
    const tables = overview.tables.map((table): ExportTable => ({ title: table.title, columns: table.columns.map((label) => ({ label, format: "TEXT" })), rows: table.rows }));
    const details: [string, string][] = [
      ["Alcance", overview.scopeLabel], ["Período", `${overview.from} a ${overview.to}`],
      ["Nivel de reportes", overview.tier ?? "—"], ["Generado", new Date(overview.generatedAt).toLocaleString("es-BO", { timeZone: "America/La_Paz" })],
    ];
    if (overview.locked?.length) details.push(["Widgets de planes superiores", String(overview.locked.length)]);
    return {
      title: overview.title, scopeLabel: overview.scopeLabel, period: `${overview.from} a ${overview.to}`, details, filters: [],
      notes: [...overview.deterministicInsights, ...(overview.policy?.clamped ? ["El período se ajustó a la ventana de historial del plan."] : [])],
      tables: [kpis, ...charts, ...tables],
    };
  }

  // -------------------------------------------------------------------------
  // Marca
  // -------------------------------------------------------------------------

  private async brand(companyId: string): Promise<Brand> {
    const [brand, logo] = await Promise.all([this.branding.brandById(companyId), this.branding.logoAsset(companyId)]);
    const palette = brand?.palette as { accent?: string; ink?: string; accentSoft?: string } | undefined;
    return {
      name: brand?.name ?? "Empresa",
      accent: palette?.accent ?? "#8B6A34",
      ink: palette?.ink ?? "#17130F",
      soft: palette?.accentSoft ?? "#F3EEE6",
      // pdfkit solo incrusta PNG/JPEG; otros formatos usan el monograma.
      logo: logo && /png|jpe?g/.test(logo.contentType) ? logo.bytes : null,
    };
  }

  // -------------------------------------------------------------------------
  // XLSX
  // -------------------------------------------------------------------------

  private async xlsx(document: ExportDocument, brand: Brand): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "VÉLORA";
    workbook.company = brand.name;
    workbook.title = document.title;
    workbook.created = new Date();
    const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;

    const summary = workbook.addWorksheet("Resumen", { properties: { tabColor: { argb: argb(brand.accent) } } });
    summary.columns = [{ width: 30 }, { width: 80 }];
    summary.addRow([brand.name]).font = { name: "Calibri", size: 18, bold: true, color: { argb: argb(brand.ink) } };
    summary.addRow([document.title]).font = { size: 13, bold: true, color: { argb: argb(brand.accent) } };
    summary.addRow([]);
    const section = (label: string) => {
      const row = summary.addRow([label]);
      row.font = { bold: true, color: { argb: "FFFFFFFF" } };
      row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(brand.accent) } };
      row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(brand.accent) } };
    };
    section("Metadatos");
    for (const [label, value] of document.details) summary.addRow([label, value]).getCell(1).font = { bold: true };
    summary.addRow([]);
    section("Filtros aplicados");
    if (document.filters.length === 0) summary.addRow(["Sin filtros", "Todos los datos del alcance y período"]);
    for (const [label, value] of document.filters) summary.addRow([label, value]).getCell(1).font = { bold: true };
    if (document.notes.length) {
      summary.addRow([]);
      section("Notas");
      for (const note of document.notes) summary.addRow(["", note]).getCell(2).alignment = { wrapText: true, vertical: "top" };
    }

    const used = new Set(["Resumen"]);
    for (const table of document.tables) {
      let name = table.title.replace(/[\\/*?:[\]]/g, " ").slice(0, 28).trim() || "Datos";
      for (let suffix = 2; used.has(name); suffix += 1) name = `${name.slice(0, 25)} ${suffix}`;
      used.add(name);
      const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
      const header = sheet.addRow(table.columns.map((column) => column.label));
      header.font = { bold: true, color: { argb: "FFFFFFFF" } };
      header.alignment = { vertical: "middle", wrapText: true };
      header.height = 24;
      header.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(brand.accent) } }; });
      for (const values of table.rows) sheet.addRow(values);
      table.columns.forEach((column, index) => {
        const xlsxColumn = sheet.getColumn(index + 1);
        if (XLSX_FORMAT[column.format]) xlsxColumn.numFmt = XLSX_FORMAT[column.format]!;
        const longest = Math.max(column.label.length, ...table.rows.slice(0, 200).map((row) => String(row[index] ?? "").length));
        xlsxColumn.width = Math.min(48, Math.max(10, longest + 3));
      });
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, table.rows.length + 1), column: table.columns.length } };
      if (table.totals) {
        const totals = sheet.addRow(table.totals.map((value) => value ?? ""));
        totals.font = { bold: true };
        totals.eachCell((cell) => { cell.border = { top: { style: "thin", color: { argb: argb(brand.ink) } } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(brand.soft) } }; });
      }
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  // -------------------------------------------------------------------------
  // PDF
  // -------------------------------------------------------------------------

  private pdf(document: ExportDocument, brand: Brand): Promise<Buffer> {
    const wide = document.tables.some((table) => table.columns.length > 6);
    const doc = new PDFDocument({ size: "A4", layout: wide ? "landscape" : "portrait", margin: 40, bufferPages: true, info: { Title: pdfSafe(document.title), Author: pdfSafe(brand.name), Creator: "VELORA" } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const bottom = () => doc.page.height - doc.page.margins.bottom - 24;

    // Encabezado: logo o monograma, nombre de la empresa y título.
    const top = doc.page.margins.top;
    if (brand.logo) {
      try { doc.image(brand.logo, left, top, { fit: [48, 48] }); } catch { brand.logo = null; }
    }
    if (!brand.logo) {
      doc.circle(left + 24, top + 24, 24).fill(brand.accent);
      doc.fillColor("#FFFFFF").font("Times-Bold").fontSize(22).text(pdfSafe(brand.name.charAt(0).toUpperCase()), left, top + 12, { width: 48, align: "center" });
    }
    doc.fillColor(brand.ink).font("Times-Bold").fontSize(20).text(pdfSafe(brand.name), left + 62, top + 2, { width: width - 62 });
    doc.fillColor(brand.accent).font("Helvetica-Bold").fontSize(12).text(pdfSafe(document.title), left + 62, doc.y + 2, { width: width - 62 });
    doc.moveTo(left, top + 60).lineTo(left + width, top + 60).lineWidth(1.5).strokeColor(brand.accent).stroke();
    doc.y = top + 70;

    // Metadatos y filtros.
    doc.font("Helvetica").fontSize(9).fillColor(brand.ink);
    for (const [label, value] of document.details) {
      doc.font("Helvetica-Bold").text(pdfSafe(`${label}: `), left, doc.y, { continued: true }).font("Helvetica").text(pdfSafe(value));
    }
    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fillColor(brand.accent).text("Filtros aplicados");
    doc.font("Helvetica").fillColor(brand.ink).text(pdfSafe(document.filters.length ? document.filters.map(([label, value]) => `${label}: ${value}`).join("  ·  ") : "Sin filtros: todos los datos del alcance y período."), { width });
    for (const note of document.notes) doc.font("Helvetica-Oblique").fontSize(8).fillColor("#555555").text(pdfSafe(`· ${note}`), { width });
    doc.moveDown(0.6);

    for (const table of document.tables) this.pdfTable(doc, table, brand, left, width, bottom);

    // Pie con número de página en cada hoja (bufferPages).
    const range = doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
      doc.switchToPage(index);
      const savedBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font("Helvetica").fontSize(8).fillColor("#777777")
        .text(pdfSafe(`${brand.name} · ${document.period} · Generado con VÉLORA`), left, doc.page.height - 30, { width: width / 2, lineBreak: false })
        .text(`Página ${index + 1} de ${range.count}`, left + width / 2, doc.page.height - 30, { width: width / 2, align: "right", lineBreak: false });
      doc.page.margins.bottom = savedBottom;
    }
    doc.end();
    return done;
  }

  private pdfTable(doc: PDFKit.PDFDocument, table: ExportTable, brand: Brand, left: number, width: number, bottom: () => number): void {
    const count = table.columns.length;
    const textWeight = table.columns.map((column) => (column.format === "TEXT" ? 2 : 1.2));
    const unit = width / textWeight.reduce((sum, value) => sum + value, 0);
    const widths = textWeight.map((weight) => weight * unit);
    const rowHeight = 16;
    const drawRow = (cells: string[], options: { header?: boolean; total?: boolean; zebra?: boolean }) => {
      if (doc.y + rowHeight > bottom()) { doc.addPage(); drawHeader(); }
      const y = doc.y;
      if (options.header) doc.rect(left, y, width, rowHeight).fill(brand.accent);
      else if (options.total) doc.rect(left, y, width, rowHeight).fill(brand.soft);
      else if (options.zebra) doc.rect(left, y, width, rowHeight).fill("#F6F5F3");
      let x = left;
      cells.forEach((cell, index) => {
        const numeric = table.columns[index]!.format !== "TEXT";
        doc.font(options.header || options.total ? "Helvetica-Bold" : "Helvetica").fontSize(count > 9 ? 6.5 : 8)
          .fillColor(options.header ? "#FFFFFF" : brand.ink)
          .text(pdfSafe(cell), x + 3, y + 4, { width: widths[index]! - 6, height: rowHeight - 4, align: numeric && !options.header ? "right" : "left", lineBreak: false, ellipsis: true });
        x += widths[index]!;
      });
      if (options.total) doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.8).strokeColor(brand.ink).stroke();
      doc.y = y + rowHeight;
      doc.x = left;
    };
    const drawHeader = () => drawRow(table.columns.map((column) => column.label), { header: true });

    if (doc.y + 3 * rowHeight + 18 > bottom()) doc.addPage();
    doc.font("Helvetica-Bold").fontSize(11).fillColor(brand.accent).text(pdfSafe(table.title), left, doc.y);
    doc.moveDown(0.3);
    drawHeader();
    if (table.rows.length === 0) drawRow(table.columns.map((_, index) => (index === 0 ? "Sin datos en el período" : "")), {});
    table.rows.forEach((row, rowIndex) => drawRow(row.map((value, index) => formatCell(value, table.columns[index]!.format)), { zebra: rowIndex % 2 === 1 }));
    if (table.totals) drawRow(table.totals.map((value, index) => formatCell(value, table.columns[index]!.format)), { total: true });
    doc.moveDown(0.8);
  }
}
