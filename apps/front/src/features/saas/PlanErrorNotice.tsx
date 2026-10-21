import { Link } from "react-router-dom";
import { ApiClientError } from "../../core/api/apiClient";
import { Notice } from "../../shared/feedback/Notice";

const UPGRADE_CODES = new Set(["PLAN_LIMIT_COMPANIES", "PLAN_LIMIT_STORES", "PLAN_LIMIT_PRODUCTS", "PLAN_LIMIT_TRY_ON", "PLAN_LIMIT_BRANDING", "PLAN_LIMIT_REPORT_FEATURE", "PLAN_LIMIT_REPORT_HISTORY", "SUBSCRIPTION_INACTIVE"]);

/** Traduce errores PLAN_LIMIT_* a un aviso con invitación a mejorar el plan. */
export function PlanErrorNotice({ error, upgradeTo = "/admin/mi-plan" }: { error: unknown; upgradeTo?: string | null }) {
  if (!error) return null;
  const apiError = error instanceof ApiClientError ? error : null;
  const message = apiError?.message ?? (error instanceof Error ? error.message : "No se pudo completar la operación.");
  const requiredPlan = typeof apiError?.details.requiredPlan === "string" ? apiError.details.requiredPlan : null;
  const canUpgrade = apiError?.code ? UPGRADE_CODES.has(apiError.code) : false;
  return <Notice kind="error">{message}{canUpgrade && upgradeTo ? <> <Link className="text-link" to={upgradeTo}>{requiredPlan ? `Mejorar a ${requiredPlan}` : "Ver mi plan"}</Link></> : null}</Notice>;
}
