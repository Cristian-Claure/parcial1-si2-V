import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  RuntimeConfigService,
} from "../common/config/runtime-config.service.js";

import type {
  UsersRepository,
} from "../users/users.repository.js";

import {
  passwordMatches,
} from "../auth/security.js";

import {
  AdminBootstrapService,
} from "./admin-bootstrap.service.js";

interface BootstrapConfig {
  BOOTSTRAP_ADMIN_ENABLED:
    boolean;
  BOOTSTRAP_ADMIN_EMAIL:
    string |
    undefined;
  BOOTSTRAP_ADMIN_PASSWORD:
    string |
    undefined;
  BOOTSTRAP_ADMIN_FIRST_NAME:
    string;
  BOOTSTRAP_ADMIN_LAST_NAME:
    string;
}

interface CreateAdminInput {
  firstName:
    string;
  lastName:
    string;
  email:
    string;
  passwordHash:
    string;
}

function runtimeConfig(
  overrides:
    Partial<BootstrapConfig> = {},
): RuntimeConfigService {
  return {
    value: {
      BOOTSTRAP_ADMIN_ENABLED:
        true,
      BOOTSTRAP_ADMIN_EMAIL:
        "Admin@Velora.Test",
      BOOTSTRAP_ADMIN_PASSWORD:
        " bootstrap secret ",
      BOOTSTRAP_ADMIN_FIRST_NAME:
        "Admin",
      BOOTSTRAP_ADMIN_LAST_NAME:
        "Velora",
      ...overrides,
    },
  } as unknown as
    RuntimeConfigService;
}

function repository(
  exists = false,
) {
  const emailExists =
    vi.fn(
      async (_email: string) =>
        exists,
    );

  const createAdmin =
    vi.fn(
      async (_input: CreateAdminInput) =>
        undefined,
    );

  const isUniqueViolation =
    vi.fn(
      (error: unknown) =>
        typeof error ===
          "object" &&
        error !== null &&
        "code" in error &&
        (
          error as {
            code?: unknown;
          }
        ).code ===
          "23505",
    );

  return {
    instance: {
      emailExists,
      createAdmin,
      isUniqueViolation,
    } as unknown as
      UsersRepository,
    emailExists,
    createAdmin,
  };
}

describe(
  "AdminBootstrapService",
  () => {
    it(
      "is disabled by default policy",
      async () => {
        const users =
          repository();
        const service =
          new AdminBootstrapService(
            users.instance,
            runtimeConfig({
              BOOTSTRAP_ADMIN_ENABLED:
                false,
            }),
          );

        await service
          .onApplicationBootstrap();

        expect(
          users.emailExists,
        ).not.toHaveBeenCalled();
        expect(
          users.createAdmin,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "does nothing when credentials are missing",
      async () => {
        const users =
          repository();
        const service =
          new AdminBootstrapService(
            users.instance,
            runtimeConfig({
              BOOTSTRAP_ADMIN_PASSWORD:
                undefined,
            }),
          );

        await service
          .onApplicationBootstrap();

        expect(
          users.emailExists,
        ).not.toHaveBeenCalled();
        expect(
          users.createAdmin,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "is idempotent when the configured email already exists",
      async () => {
        const users =
          repository(
            true,
          );
        const service =
          new AdminBootstrapService(
            users.instance,
            runtimeConfig(),
          );

        await service
          .onApplicationBootstrap();

        expect(
          users.emailExists,
        ).toHaveBeenCalledWith(
          "admin@velora.test",
        );
        expect(
          users.createAdmin,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "creates an active storeless admin with a hashed exact password",
      async () => {
        const users =
          repository();
        const service =
          new AdminBootstrapService(
            users.instance,
            runtimeConfig(),
          );

        await service
          .onApplicationBootstrap();

        expect(
          users.createAdmin,
        ).toHaveBeenCalledTimes(
          1,
        );

        const input =
          users.createAdmin
            .mock.calls[0]?.[0];

        expect(input)
          .toMatchObject({
            firstName:
              "Admin",
            lastName:
              "Velora",
            email:
              "admin@velora.test",
          });

        expect(
          input?.passwordHash,
        ).not.toBe(
          " bootstrap secret ",
        );

        expect(
          await passwordMatches(
            " bootstrap secret ",
            input?.passwordHash ??
              "",
          ),
        ).toBe(
          true,
        );
      },
    );

    it(
      "treats a concurrent unique insert as an idempotent success",
      async () => {
        const users =
          repository();
        users.createAdmin
          .mockRejectedValueOnce({
            code:
              "23505",
          });

        const service =
          new AdminBootstrapService(
            users.instance,
            runtimeConfig(),
          );

        await expect(
          service
            .onApplicationBootstrap(),
        ).resolves.toBeUndefined();
      },
    );

    it(
      "does not hide unexpected database errors",
      async () => {
        const users =
          repository();
        users.createAdmin
          .mockRejectedValueOnce(
            new Error(
              "database unavailable",
            ),
          );

        const service =
          new AdminBootstrapService(
            users.instance,
            runtimeConfig(),
          );

        await expect(
          service
            .onApplicationBootstrap(),
        ).rejects.toThrow(
          "database unavailable",
        );
      },
    );
  },
);
