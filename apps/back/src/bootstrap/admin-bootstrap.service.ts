import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from "@nestjs/common";

import {
  RuntimeConfigService,
} from "../common/config/runtime-config.service.js";

import {
  UsersRepository,
} from "../users/users.repository.js";

import {
  hashPassword,
} from "../auth/security.js";

@Injectable()
export class AdminBootstrapService
  implements OnApplicationBootstrap {
  private readonly logger =
    new Logger(
      AdminBootstrapService.name,
    );

  constructor(
    private readonly users:
      UsersRepository,

    private readonly config:
      RuntimeConfigService,
  ) {}

  async onApplicationBootstrap():
    Promise<void> {
    const config =
      this.config.value;

    if (
      !config
        .BOOTSTRAP_ADMIN_ENABLED
    ) {
      return;
    }

    const email =
      config
        .BOOTSTRAP_ADMIN_EMAIL
        ?.trim()
        .toLowerCase();

    const password =
      config
        .BOOTSTRAP_ADMIN_PASSWORD;

    if (
      !email ||
      !password
    ) {
      this.logger.warn(
        "Admin bootstrap habilitado sin email/password; se omite la creación.",
      );
      return;
    }

    if (
      await this.users
        .emailExists(
          email,
        )
    ) {
      this.logger.log(
        "Admin bootstrap omitido: la cuenta configurada ya existe.",
      );
      return;
    }

    const passwordHash =
      await hashPassword(
        password,
      );

    try {
      await this.users
        .createAdmin({
          firstName:
            config
              .BOOTSTRAP_ADMIN_FIRST_NAME,

          lastName:
            config
              .BOOTSTRAP_ADMIN_LAST_NAME,

          email,
          passwordHash,
        });

      this.logger.log(
        "Admin bootstrap completado.",
      );
    }
    catch (error) {
      if (
        this.users
          .isUniqueViolation(
            error,
          )
      ) {
        this.logger.log(
          "Admin bootstrap omitido: la cuenta fue creada concurrentemente.",
        );
        return;
      }

      throw error;
    }
  }
}
