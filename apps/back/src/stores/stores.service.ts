import {
  Injectable,
} from "@nestjs/common";

import type {
  CreateStoreRequest,
  StoreResponse,
} from "@velora/contracts";

import {
  ApiHttpError,
} from "../common/http/api-http.error.js";

import {
  StoresRepository,
} from "./stores.repository.js";

@Injectable()
export class StoresService {
  constructor(
    private readonly stores:
      StoresRepository,
  ) {}

  async listStores(
    companyId: string,
  ): Promise<StoreResponse[]> {
    await this.requireActiveCompany(
      companyId,
    );

    return this.stores
      .listByCompany(
        companyId,
      );
  }

  async createStore(
    request:
      CreateStoreRequest,
  ): Promise<StoreResponse> {
    await this.requireActiveCompany(
      request.companyId,
    );

    if (
      await this.stores
        .codeExists(
          request.companyId,
          request.code,
        )
    ) {
      throw new ApiHttpError(
        409,
        "Ya existe una sucursal con ese código.",
      );
    }

    try {
      return await this.stores
        .create(
          request,
        );
    }
    catch (error) {
      if (
        this.stores
          .isUniqueViolation(
            error,
          )
      ) {
        throw new ApiHttpError(
          409,
          "Ya existe una sucursal con ese código.",
        );
      }

      throw error;
    }
  }

  private async requireActiveCompany(
    companyId: string,
  ): Promise<void> {
    if (
      !(
        await this.stores
          .companyIsActive(
            companyId,
          )
      )
    ) {
      throw new ApiHttpError(
        400,
        "La compañía seleccionada no existe o está inactiva.",
      );
    }
  }
}
