import {
  Injectable,
} from "@nestjs/common";

import {
  parseServerRuntimeConfig,
  type ServerRuntimeConfig,
} from "@velora/config";

@Injectable()
export class RuntimeConfigService {
  readonly value:
    ServerRuntimeConfig;

  constructor() {
    this.value =
      parseServerRuntimeConfig(
        process.env,
      );
  }

  allowedCorsOrigins():
    string[] {
    return this.value
      .VELORA_CORS_ALLOWED_ORIGINS
      .split(",")
      .map(
        (origin) =>
          origin.trim(),
      )
      .filter(
        (origin) =>
          origin.length > 0,
      );
  }
}