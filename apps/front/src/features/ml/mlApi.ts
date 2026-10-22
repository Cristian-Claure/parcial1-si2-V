import type { MlAnomalies, MlCancelRisk, MlForecast, MlModelKey, MlOverview, MlSegments, StartMlRunsResponse } from "@velora/contracts";
import { apiRequest, jsonBody } from "../../core/api/apiClient";

const query = (companyId: string) => `?companyId=${encodeURIComponent(companyId)}`;

export const mlApi = {
  overview: (companyId: string) => apiRequest<MlOverview>(`/api/admin/ml/overview${query(companyId)}`),
  start: (companyId: string, models?: MlModelKey[]) =>
    apiRequest<StartMlRunsResponse>("/api/admin/ml/runs", { method: "POST", body: jsonBody({ companyId, ...(models ? { models } : {}) }) }),
  forecast: (companyId: string) => apiRequest<MlForecast>(`/api/admin/ml/forecast${query(companyId)}`),
  segments: (companyId: string) => apiRequest<MlSegments>(`/api/admin/ml/segments${query(companyId)}`),
  cancelRisk: (companyId: string) => apiRequest<MlCancelRisk>(`/api/admin/ml/cancel-risk${query(companyId)}`),
  anomalies: (companyId: string) => apiRequest<MlAnomalies>(`/api/admin/ml/anomalies${query(companyId)}`),
};
