import {
  ArgumentsHost,
  Catch,
  HttpException,
  type ExceptionFilter,
} from "@nestjs/common";

import type {
  ApiError,
} from "@velora/contracts";

import {
  ApiHttpError,
} from "./api-http.error.js";

import {
  RateLimitExceededError,
} from "./rate-limit-exceeded.error.js";

interface HttpResponse {
  status(
    statusCode: number,
  ): HttpResponse;

  json(
    body: unknown,
  ): unknown;

  setHeader(
    name: string,
    value: string,
  ): void;
}

@Catch()
export class ApiExceptionFilter
  implements ExceptionFilter {
  catch(
    error: unknown,
    host: ArgumentsHost,
  ): void {
    const response =
      host
        .switchToHttp()
        .getResponse<HttpResponse>();

    if (
      error instanceof
      RateLimitExceededError
    ) {
      response.setHeader(
        "Retry-After",
        String(
          error.retryAfterSeconds,
        ),
      );

      response
        .status(429)
        .json({
          message:
            error.message,
        });

      return;
    }

    let status =
      500;

    let message =
      "No se pudo completar la solicitud.";

    let errors:
      Record<
        string,
        string
      > = {};

    if (
      error instanceof
      ApiHttpError
    ) {
      status =
        error.status;

      message =
        error.message;

      errors =
        error.errors;
    }
    else if (
      error instanceof
      HttpException
    ) {
      status =
        error.getStatus();

      if (status === 400) {
        message =
          "Revise los datos ingresados.";
      }
      else {
        const exceptionResponse =
          error.getResponse();

        if (
          typeof exceptionResponse ===
          "string"
        ) {
          message =
            exceptionResponse;
        }
        else if (
          typeof exceptionResponse ===
            "object" &&
          exceptionResponse !==
            null &&
          "message" in
            exceptionResponse
        ) {
          const candidate =
            exceptionResponse.message;

          if (
            typeof candidate ===
            "string"
          ) {
            message =
              candidate;
          }
        }
      }
    }

    const body:
      ApiError = {
      timestamp:
        new Date()
          .toISOString(),

      status,

      message,

      errors,
    };

    response
      .status(status)
      .json(body);
  }
}