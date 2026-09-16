import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";

import type {
  AuthenticatedRequest,
} from "../common/http/authenticated-request.js";

import {
  RateLimitExceededError,
} from "../common/http/rate-limit-exceeded.error.js";

import {
  AuthRateLimitService,
} from "./auth-rate-limit.service.js";

@Injectable()
export class AuthRateLimitGuard
  implements CanActivate {
  constructor(
    private readonly rateLimit:
      AuthRateLimitService,
  ) {}

  canActivate(
    context:
      ExecutionContext,
  ): boolean {
    const request =
      context
        .switchToHttp()
        .getRequest<
          AuthenticatedRequest
        >();

    const decision =
      this.rateLimit
        .registerAttempt(
          request,
        );

    if (!decision.allowed) {
      throw new RateLimitExceededError(
        decision
          .retryAfterSeconds,
      );
    }

    return true;
  }
}