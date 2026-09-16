import {
  Controller,
  Get,
  ServiceUnavailableException,
} from "@nestjs/common";

import {
  DatabaseService,
} from "../database/database.service.js";

@Controller("api/health")
export class HealthController {
  constructor(
    private readonly database:
      DatabaseService,
  ) {}

  @Get()
  async health() {
    try {
      await this.database
        .ping();
    }
    catch {
      throw new ServiceUnavailableException(
        "Base de datos no disponible.",
      );
    }

    return {
      status:
        "UP",

      service:
        "velora-api",

      stack:
        "nestjs",

      db:
        "UP",
    };
  }
}