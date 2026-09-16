import {
  Injectable,
} from "@nestjs/common";

import type {
  UserRole,
} from "@velora/contracts";

import type {
  AuthPrincipal,
} from "../../auth/security.js";

import {
  ApiHttpError,
} from "../http/api-http.error.js";

import {
  UsersRepository,
} from "../../users/users.repository.js";

export interface ActorAccessContext {
  userId:
    string;

  role:
    UserRole;

  storeId:
    string |
    null;

  companyId:
    string |
    null;
}

@Injectable()
export class AccessContextService {
  constructor(
    private readonly users:
      UsersRepository,
  ) {}

  async resolve(
    principal:
      AuthPrincipal,
  ): Promise<ActorAccessContext> {
    const user =
      await this.users
        .findById(
          principal.userId,
        );

    if (
      !user ||
      user.role !==
        principal.role
    ) {
      throw new ApiHttpError(
        401,
        "Usuario autenticado no encontrado.",
      );
    }

    if (
      user.status !==
      "ACTIVE"
    ) {
      throw new ApiHttpError(
        403,
        "El usuario no está activo.",
      );
    }

    if (
      user.role ===
      "STORE_MANAGER" &&
      (
        !user.storeId ||
        !user.storeCompanyId
      )
    ) {
      throw new ApiHttpError(
        403,
        "El encargado no tiene una sucursal asignada.",
      );
    }

    return {
      userId:
        user.id,

      role:
        user.role,

      storeId:
        user.storeId,

      companyId:
        user.storeCompanyId,
    };
  }
}
