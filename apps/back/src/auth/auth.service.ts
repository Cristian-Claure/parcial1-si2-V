import {
  Injectable,
} from "@nestjs/common";

import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  UserProfile,
} from "@velora/contracts";

import {
  RuntimeConfigService,
} from "../common/config/runtime-config.service.js";

import {
  ApiHttpError,
} from "../common/http/api-http.error.js";

import {
  UsersRepository,
} from "../users/users.repository.js";

import {
  hashPassword,
  issueAuthToken,
  passwordMatches,
} from "./security.js";

@Injectable()
export class AuthService {
  constructor(
    private readonly users:
      UsersRepository,

    private readonly config:
      RuntimeConfigService,
  ) {}

  async registerCustomer(
    request:
      RegisterRequest,
  ): Promise<AuthResponse> {
    const email =
      request.email
        .trim()
        .toLowerCase();

    if (
      await this.users
        .emailExists(
          email,
        )
    ) {
      throw new ApiHttpError(
        409,
        "Ya existe una cuenta con este correo.",
      );
    }

    const passwordHash =
      await hashPassword(
        request.password,
      );

    try {
      const user =
        await this.users
          .createCustomer({
            firstName:
              request.firstName,

            lastName:
              request.lastName,

            email,

            passwordHash,
          });

      return issueAuthToken(
        this.users
          .toProfile(
            user,
          ),
        this.config.value,
      );
    }
    catch (error) {
      if (
        this.users
          .isUniqueViolation(
            error,
          )
      ) {
        throw new ApiHttpError(
          409,
          "Ya existe una cuenta con este correo.",
        );
      }

      throw error;
    }
  }

  async login(
    request:
      LoginRequest,
  ): Promise<AuthResponse> {
    const user =
      await this.users
        .findByEmail(
          request.email
            .trim(),
        );

    if (!user) {
      throw new ApiHttpError(
        401,
        "Correo o contraseña incorrectos.",
      );
    }

    if (
      user.status !==
      "ACTIVE"
    ) {
      throw new ApiHttpError(
        403,
        "La cuenta no está activa.",
      );
    }

    const matches =
      await passwordMatches(
        request.password,
        user.passwordHash,
      );

    if (!matches) {
      throw new ApiHttpError(
        401,
        "Correo o contraseña incorrectos.",
      );
    }

    return issueAuthToken(
      this.users
        .toProfile(
          user,
        ),
      this.config.value,
    );
  }

  async profile(
    id: string,
  ): Promise<UserProfile> {
    const user =
      await this.users
        .findById(
          id,
        );

    if (!user) {
      throw new ApiHttpError(
        404,
        "Usuario no encontrado.",
      );
    }

    return this.users
      .toProfile(
        user,
      );
  }
}