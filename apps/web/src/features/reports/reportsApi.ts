import type {
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
};
