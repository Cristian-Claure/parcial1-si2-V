import PDFDocument from "pdfkit";
import { formatMoney } from "@velora/contracts";
import { pdfSafe } from "../reports/export/report-export.service.js";

export interface PlanReceiptInput {
  number: string;
  paidAt: Date;
  ownerName: string;
  ownerEmail: string;
  planName: string;
  method: string;
  amount: string;
  currency: string;
  paymentId: string;
}

/** Comprobante PDF de un pago de plan PAID (pdfkit, fuentes estándar; sin datos de tarjeta). */
export function renderPlanReceipt(input: PlanReceiptInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A5", margin: 36, info: { Title: pdfSafe(`Comprobante ${input.number}`), Author: "Trama", Creator: "Trama" } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const date = new Intl.DateTimeFormat("es-BO", { dateStyle: "long", timeStyle: "short", timeZone: "America/La_Paz" }).format(input.paidAt);
    doc.font("Helvetica-Bold").fontSize(18).text("Trama");
    doc.font("Helvetica").fontSize(9).fillColor("#555555").text(pdfSafe("Plataforma de tiendas · comprobante de pago de suscripción"));
    doc.moveDown(1.2).fillColor("#000000").font("Helvetica-Bold").fontSize(13).text(pdfSafe(`Comprobante N.º ${input.number}`));
    doc.moveDown(0.6).font("Helvetica").fontSize(10);
    const rows: [string, string][] = [
      ["Fecha de pago", date],
      ["Titular", `${input.ownerName} <${input.ownerEmail}>`],
      ["Concepto", `Plan ${input.planName} · 30 días`],
      ["Método", input.method],
      ["Importe", formatMoney(Number(input.amount), input.currency)],
      ["Id. de pago", input.paymentId],
    ];
    for (const [label, value] of rows) {
      doc.font("Helvetica-Bold").text(pdfSafe(`${label}: `), { continued: true }).font("Helvetica").text(pdfSafe(value));
      doc.moveDown(0.3);
    }
    doc.moveDown(1).fontSize(8).fillColor("#555555").text(pdfSafe("Documento generado por Trama. No es una factura fiscal. Los cobros por QR en modo demostración no mueven dinero real."));
    doc.end();
  });
}
