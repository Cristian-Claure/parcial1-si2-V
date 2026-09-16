import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import {
  loginRequestSchema,
  registerRequestSchema,
  type AuthResponse,
  type LoginRequest,
  type RegisterRequest,
  type UserProfile,
} from "@velora/contracts";

import type {
  AuthenticatedRequest,
} from "../common/http/authenticated-request.js";

import {
  ApiHttpError,
} from "../common/http/api-http.error.js";

import {
  ZodValidationPipe,
} from "../common/http/zod-validation.pipe.js";

import {
  AuthRateLimitGuard,
} from "./auth-rate-limit.guard.js";

import {
  AuthService,
} from "./auth.service.js";

import {
  BearerAuthGuard,
} from "./bearer-auth.guard.js";

@Controller("api/auth")
export class AuthController {
  constructor(
    private readonly auth:
      AuthService,
  ) {}

  @Post("register")
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    AuthRateLimitGuard,
  )
  register(
    @Body(
      new ZodValidationPipe(
        registerRequestSchema,
      ),
    )
    request:
      RegisterRequest,
  ): Promise<AuthResponse> {
    return this.auth
      .registerCustomer(
        request,
      );
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    AuthRateLimitGuard,
  )
  login(
    @Body(
      new ZodValidationPipe(
        loginRequestSchema,
      ),
    )
    request:
      LoginRequest,
  ): Promise<AuthResponse> {
    return this.auth
      .login(
        request,
      );
  }

  @Get("me")
  @UseGuards(
    BearerAuthGuard,
  )
  me(
    @Req()
    request:
      AuthenticatedRequest,
  ): Promise<UserProfile> {
    const principal =
      request.authPrincipal;

    if (!principal) {
      throw new ApiHttpError(
        401,
        "No autenticado.",
      );
    }

    return this.auth
      .profile(
        principal.userId,
      );
  }
}