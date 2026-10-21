import {
  Injectable,
} from "@nestjs/common";

import type {
  AuthPrincipal,
} from "../../auth/security.js";

import {
  TenantScopeService,
  type ActorAccessContext,
} from "./tenant-scope.service.js";

export type {
  ActorAccessContext,
} from "./tenant-scope.service.js";

/**
 * Punto de entrada histórico del contexto del actor. Delega en
 * TenantScopeService, que resuelve rol, sucursal y alcance multi-tenant desde la BD.
 */
@Injectable()
export class AccessContextService {
  constructor(
    private readonly scope:
      TenantScopeService,
  ) {}

  resolve(
    principal:
      AuthPrincipal,
  ): Promise<ActorAccessContext> {
    return this.scope
      .resolve(
        principal,
      );
  }
}
