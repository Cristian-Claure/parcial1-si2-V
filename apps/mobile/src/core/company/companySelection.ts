import type { CompanyResponse } from "@velora/contracts";

export function resolveCompanySelection(
  companies: CompanyResponse[],
  requested: string | null,
): string | null {
  if (
    requested &&
    companies.some((company) => company.id === requested)
  ) {
    return requested;
  }

  return companies.length === 1
    ? companies[0]?.id ?? null
    : null;
}