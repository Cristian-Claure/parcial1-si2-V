import "reflect-metadata";

import {
  NestFactory,
} from "@nestjs/core";

import type {
  NestExpressApplication,
} from "@nestjs/platform-express";

import {
  AppModule,
} from "./app.module.js";

import {
  RuntimeConfigService,
} from "./common/config/runtime-config.service.js";

import {
  ApiExceptionFilter,
} from "./common/http/api-exception.filter.js";

function apiPort():
  number {
  const raw =
    process.env.PORT;

  if (
    raw === undefined ||
    raw.trim() === ""
  ) {
    return 3000;
  }

  const parsed =
    Number(raw);

  if (
    !Number.isInteger(
      parsed,
    ) ||
    parsed <= 0 ||
    parsed > 65535
  ) {
    throw new Error(
      "PORT debe ser un entero válido entre 1 y 65535.",
    );
  }

  return parsed;
}

async function bootstrap():
  Promise<void> {
  const app =
    await NestFactory
      .create<
        NestExpressApplication
      >(
        AppModule,
        {
          rawBody:
            true,
        },
      );

  const config =
    app.get(
      RuntimeConfigService,
    );

  const allowedOrigins =
    config
      .allowedCorsOrigins();

  app.enableCors({
    origin:
      (
        origin,
        callback,
      ) => {
        if (
          origin === undefined ||
          allowedOrigins
            .includes(
              origin,
            )
        ) {
          callback(
            null,
            true,
          );

          return;
        }

        callback(
          null,
          false,
        );
      },

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "Stripe-Signature",
    ],

    credentials:
      true,
  });

  app.useGlobalFilters(
    new ApiExceptionFilter(),
  );

  app.enableShutdownHooks();

  await app.listen(
    apiPort(),
    "0.0.0.0",
  );
}

void bootstrap();
