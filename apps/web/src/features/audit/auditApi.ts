import type {
  AuditEventPage,
} from "@velora/contracts";

import {
  apiRequest,
} from "../../core/api/apiClient";

export interface AuditSearchInput {
  actorId?:
    string;
  role?:
    string;
  category?:
    string;
  method?:
    string;
  success?:
    boolean |
    null;
  from?:
    string |
    null;
  to?:
    string |
    null;
  q?:
    string;
  page:
    number;
  size:
    number;
}

export const auditApi = {
  search: (
    input:
      AuditSearchInput,
  ) => {
    const params =
      new URLSearchParams();

    const set = (
      key:
        string,
      value:
        string |
        number |
        boolean |
        null |
        undefined,
    ) => {
      if (
        value ===
          null ||
        value ===
          undefined ||
        value ===
          ""
      ) {
        return;
      }

      params.set(
        key,
        String(
          value,
        ),
      );
    };

    set(
      "actorId",
      input.actorId,
    );
    set(
      "role",
      input.role,
    );
    set(
      "category",
      input.category,
    );
    set(
      "method",
      input.method,
    );
    set(
      "success",
      input.success,
    );
    set(
      "from",
      input.from,
    );
    set(
      "to",
      input.to,
    );
    set(
      "q",
      input.q,
    );
    set(
      "page",
      input.page,
    );
    set(
      "size",
      input.size,
    );

    return apiRequest<AuditEventPage>(
      `/api/admin/audit?${params.toString()}`,
    );
  },
};
