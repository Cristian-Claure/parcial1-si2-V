import type {
  ServerRuntimeConfig,
} from "@velora/config";

import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  UserProfile,
} from "@velora/contracts";

import {
  createCustomerUser,
  findUserByEmail,
  findUserById,
  isDatabaseUniqueViolation,
  toUserProfile,
  userEmailExists,
} from "../users/user.repository";

import {
  ApiHttpError,
} from "./http";

import {
  hashPassword,
  issueAuthToken,
  passwordMatches,
} from "./security";

export async function registerCustomer(
  request: RegisterRequest,
  config: ServerRuntimeConfig,
): Promise<AuthResponse> {
  const email =
    request.email
      .trim()
      .toLowerCase();

  if (
    await userEmailExists(
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
      await createCustomerUser({
        firstName:
          request.firstName,

        lastName:
          request.lastName,

        email,

        passwordHash,
      });

    return issueAuthToken(
      toUserProfile(
        user,
      ),
      config,
    );
  }
  catch (error) {
    if (
      isDatabaseUniqueViolation(
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

export async function login(
  request: LoginRequest,
  config: ServerRuntimeConfig,
): Promise<AuthResponse> {
  const user =
    await findUserByEmail(
      request.email.trim(),
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
    toUserProfile(
      user,
    ),
    config,
  );
}

export async function profile(
  id: string,
): Promise<UserProfile> {
  const user =
    await findUserById(
      id,
    );

  if (!user) {
    throw new ApiHttpError(
      404,
      "Usuario no encontrado.",
    );
  }

  return toUserProfile(
    user,
  );
}