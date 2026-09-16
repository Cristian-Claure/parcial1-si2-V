import {
  Injectable,
} from "@nestjs/common";

import {
  RuntimeConfigService,
} from "../common/config/runtime-config.service.js";

import type {
  AuthenticatedRequest,
} from "../common/http/authenticated-request.js";

interface RateWindow {
  startedAt:
    number;

  count:
    number;
}

export interface RateLimitDecision {
  allowed:
    boolean;

  retryAfterSeconds:
    number;
}

function firstHeader(
  value:
    string |
    string[] |
    undefined,
): string | null {
  if (
    Array.isArray(
      value,
    )
  ) {
    return value[0] ?? null;
  }

  return (
    typeof value ===
    "string"
      ? value
      : null
  );
}

@Injectable()
export class AuthRateLimitService {
  private readonly windows =
    new Map<
      string,
      RateWindow
    >();

  private requestCounter =
    0;

  constructor(
    private readonly config:
      RuntimeConfigService,
  ) {}

  registerAttempt(
    request:
      AuthenticatedRequest,
  ): RateLimitDecision {
    const now =
      Math.floor(
        Date.now() /
        1000,
      );

    const windowSeconds =
      this.config.value
        .VELORA_AUTH_RATE_LIMIT_WINDOW_SECONDS;

    const maxRequests =
      this.config.value
        .VELORA_AUTH_RATE_LIMIT_MAX_REQUESTS;

    const key =
      `AUTH:${this.clientKey(
        request,
      )}`;

    const current =
      this.windows.get(
        key,
      );

    if (
      !current ||
      now -
        current.startedAt >=
        windowSeconds
    ) {
      this.windows.set(
        key,
        {
          startedAt:
            now,

          count:
            1,
        },
      );

      this.cleanup(
        now,
        windowSeconds,
      );

      return {
        allowed:
          true,

        retryAfterSeconds:
          0,
      };
    }

    const count =
      current.count +
      1;

    this.windows.set(
      key,
      {
        startedAt:
          current.startedAt,

        count,
      },
    );

    const retryAfterSeconds =
      Math.max(
        1,
        windowSeconds -
          (
            now -
            current.startedAt
          ),
      );

    this.cleanup(
      now,
      windowSeconds,
    );

    return {
      allowed:
        count <=
        maxRequests,

      retryAfterSeconds,
    };
  }

  private clientKey(
    request:
      AuthenticatedRequest,
  ): string {
    if (
      this.config.value
        .VELORA_RATE_LIMIT_TRUST_PROXY_HEADERS
    ) {
      const forwarded =
        firstHeader(
          request.headers[
            "x-forwarded-for"
          ],
        );

      if (
        forwarded &&
        forwarded.trim()
      ) {
        return (
          forwarded
            .split(",")[0]
            ?.trim() ||
          "unknown"
        );
      }
    }

    return (
      request.socket
        ?.remoteAddress ??
      request.ip ??
      "direct"
    );
  }

  private cleanup(
    now: number,
    windowSeconds: number,
  ): void {
    this.requestCounter +=
      1;

    if (
      this.requestCounter %
        256 !==
      0
    ) {
      return;
    }

    const cutoff =
      now -
      windowSeconds *
        2;

    for (
      const [
        key,
        value,
      ] of this.windows
    ) {
      if (
        value.startedAt <
        cutoff
      ) {
        this.windows.delete(
          key,
        );
      }
    }
  }
}