import type {
  ReportBuilderDefinitionInput,
  ReportBuilderResult,
  ReportDefinition,
  ReportExportFormat,
  ReportSemanticCatalog,
  AdminReportAiNarrativeRequest,
  AdminReportAiQueryRequest,
  ManagerReportAiNarrativeRequest,
  ManagerReportAiQueryRequest,
  ReportAiNarrativeResponse,
  ReportAiQueryResponse,
  ReportOverview,
  ReportPeriodBounds,
  ReportVoiceTranscriptionResponse,
} from "@velora/contracts";

import {
  apiBlobRequest,
  apiRequest,
  jsonBody,
} from "../../core/api/apiClient";

export type ReportRole =
  "ADMIN" |
  "STORE_MANAGER";

const prefix = (
  role:
    ReportRole,
) =>
  role ===
  "ADMIN"
    ? "/api/admin/reports"
    : "/api/manager/reports";

function queryString(
  values:
    Record<
      string,
      string |
      null |
      undefined
    >,
): string {
  const params =
    new URLSearchParams();

  for (
    const [
      key,
      value,
    ] of
    Object.entries(
      values,
    )
  ) {
    if (
      value
    ) {
      params.set(
        key,
        value,
      );
    }
  }

  const serialized =
    params.toString();

  return serialized
    ? `?${serialized}`
    : "";
}

export const reportsApi = {
  periodBounds: (
    role:
      ReportRole,
    companyId:
      string |
      null,
    storeId:
      string |
      null,
  ) =>
    apiRequest<ReportPeriodBounds>(
      `${prefix(role)}/period-bounds${queryString({
        companyId:
          role ===
          "ADMIN"
            ? companyId
            : null,
        storeId:
          role ===
          "ADMIN"
            ? storeId
            : null,
      })}`,
    ),

  overview: (
    role:
      ReportRole,
    input: {
      companyId:
        string |
        null;
      storeId:
        string |
        null;
      from:
        string |
        null;
      to:
        string |
        null;
    },
  ) =>
    apiRequest<ReportOverview>(
      `${prefix(role)}/overview${queryString({
        companyId:
          role ===
          "ADMIN"
            ? input.companyId
            : null,
        storeId:
          role ===
          "ADMIN"
            ? input.storeId
            : null,
        from:
          input.from,
        to:
          input.to,
      })}`,
    ),

  aiQuery: (
    role:
      ReportRole,
    body:
      AdminReportAiQueryRequest |
      ManagerReportAiQueryRequest,
  ) =>
    apiRequest<ReportAiQueryResponse>(
      `${prefix(role)}/ai-query`,
      {
        method:
          "POST",
        body:
          jsonBody(
            body,
          ),
      },
    ),

  narrative: (
    role:
      ReportRole,
    body:
      AdminReportAiNarrativeRequest |
      ManagerReportAiNarrativeRequest,
  ) =>
    apiRequest<ReportAiNarrativeResponse>(
      `${prefix(role)}/ai-narrative`,
      {
        method:
          "POST",
        body:
          jsonBody(
            body,
          ),
      },
    ),

  transcribeVoice: (
    role:
      ReportRole,
    companyId:
      string |
      null,
    audio:
      Blob,
  ) =>
    apiRequest<ReportVoiceTranscriptionResponse>(
      `${prefix(role)}/voice-transcribe${queryString({
        companyId:
          role ===
          "ADMIN"
            ? companyId
            : null,
      })}`,
      {
        method:
          "POST",
        headers: {
          "Content-Type":
            audio.type ||
            "audio/webm",
        },
        body:
          audio,
      },
    ),

  // Fase 3 · Constructor dinámico, exportación y definiciones guardadas.
  catalog: (role: ReportRole, companyId: string | null) =>
    apiRequest<ReportSemanticCatalog>(`${prefix(role)}/semantic-catalog${queryString({ companyId: role === "ADMIN" ? companyId : null })}`),

  query: (role: ReportRole, companyId: string | null, definition: ReportBuilderDefinitionInput) =>
    apiRequest<ReportBuilderResult>(`${prefix(role)}/query`, { method: "POST", body: jsonBody(builderBody(role, companyId, definition)) }),

  exportQuery: (role: ReportRole, companyId: string | null, definition: ReportBuilderDefinitionInput, format: ReportExportFormat) =>
    apiBlobRequest(`${prefix(role)}/query/export?format=${format}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(builderBody(role, companyId, definition)),
    }),

  exportOverview: (role: ReportRole, input: { companyId: string | null; storeId: string | null; from: string | null; to: string | null }, format: ReportExportFormat) =>
    apiBlobRequest(`${prefix(role)}/overview/export${queryString({
      companyId: role === "ADMIN" ? input.companyId : null, storeId: role === "ADMIN" ? input.storeId : null, from: input.from, to: input.to, format,
    })}`),

  definitions: (companyId: string) =>
    apiRequest<ReportDefinition[]>(`/api/admin/reports/definitions${queryString({ companyId })}`),

  createDefinition: (companyId: string, name: string, definition: ReportBuilderDefinitionInput) =>
    apiRequest<ReportDefinition>("/api/admin/reports/definitions", { method: "POST", body: jsonBody({ companyId, name, definition }) }),

  updateDefinition: (id: string, input: { name?: string; definition?: ReportBuilderDefinitionInput }) =>
    apiRequest<ReportDefinition>(`/api/admin/reports/definitions/${id}`, { method: "PUT", body: jsonBody(input) }),

  deleteDefinition: (id: string) =>
    apiRequest<void>(`/api/admin/reports/definitions/${id}`, { method: "DELETE" }),
};

function builderBody(role: ReportRole, companyId: string | null, definition: ReportBuilderDefinitionInput) {
  return role === "ADMIN" ? { companyId, ...definition } : definition;
}

/** Descarga un archivo generado por el backend (XLSX/PDF) con un nombre legible. */
export function saveBlob(blob: Blob, baseName: string, format: ReportExportFormat): void {
  const slug = baseName.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "reporte";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slug}-${new Date().toISOString().slice(0, 10)}.${format}`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
