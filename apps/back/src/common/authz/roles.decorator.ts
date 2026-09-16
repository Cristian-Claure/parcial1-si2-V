import {
  SetMetadata,
} from "@nestjs/common";

import type {
  UserRole,
} from "@velora/contracts";

export const REQUIRED_ROLES_KEY =
  "velora:required-roles";

export function RequireRoles(
  ...roles:
    UserRole[]
) {
  return SetMetadata(
    REQUIRED_ROLES_KEY,
    roles,
  );
}
