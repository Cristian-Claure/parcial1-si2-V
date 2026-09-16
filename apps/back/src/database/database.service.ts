import {
  Injectable,
  type OnModuleDestroy,
} from "@nestjs/common";

import {
  createDatabase,
  type VeloraDatabaseClient,
} from "@velora/database";

import {
  RuntimeConfigService,
} from "../common/config/runtime-config.service.js";

@Injectable()
export class DatabaseService
  implements OnModuleDestroy {
  private readonly client:
    VeloraDatabaseClient;

  constructor(
    config:
      RuntimeConfigService,
  ) {
    this.client =
      createDatabase(
        config.value
          .DATABASE_URL,
      );
  }

  get db():
    VeloraDatabaseClient["db"] {
    return this.client.db;
  }

  async ping():
    Promise<void> {
    await this.client
      .pool
      .query(
        "SELECT 1",
      );
  }

  async onModuleDestroy():
    Promise<void> {
    await this.client
      .pool
      .end();
  }
}