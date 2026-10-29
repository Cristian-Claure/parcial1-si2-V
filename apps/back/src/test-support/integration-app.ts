import "reflect-metadata";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { RequestMethod, type INestApplication } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { ModulesContainer, NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { UserRole } from "@velora/contracts";
import { AppModule } from "../app.module.js";
import { hashPassword } from "../auth/security.js";
import { REQUIRED_ROLES_KEY } from "../common/authz/roles.decorator.js";
import { ApiExceptionFilter } from "../common/http/api-exception.filter.js";
import type { TestDatabase } from "./integration-database.js";

export const TEST_PASSWORD = "Velora123";

export interface TestApp {
  app: INestApplication;
  baseUrl: string;
  close(): Promise<void>;
}

/** Levanta el AppModule real contra `db` (mismas piezas que main.ts) en un puerto efímero. */
export async function startTestApp(db: TestDatabase, env: Record<string, string> = {}): Promise<TestApp> {
  Object.assign(process.env, {
    DATABASE_URL: db.url,
    VELORA_JWT_SECRET: randomBytes(32).toString("hex"),
    VELORA_AUTH_RATE_LIMIT_MAX_REQUESTS: "100000",
    VELORA_ASSET_STORAGE_PROVIDER: "LOCAL",
    VELORA_ASSET_LOCAL_DIR: mkdtempSync(join(tmpdir(), "velora-assets-")),
    VELORA_PUSH_FIREBASE_ENABLED: "false",
    BOOTSTRAP_ADMIN_ENABLED: "false",
    BOOTSTRAP_PLATFORM_ADMIN_ENABLED: "false",
    OPENAI_API_KEY: "",
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
    // Servicio ML apagado por defecto (puerto sin escuchar): las pruebas usan un doble de MlClient.
    VELORA_ML_URL: "http://127.0.0.1:9",
    VELORA_ML_TOKEN: "",
    ...env,
  });
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, logger: false });
  app.useBodyParser("raw", { type: ["audio/*", "video/webm"], limit: "8mb" });
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address() as AddressInfo;
  return { app, baseUrl: `http://127.0.0.1:${address.port}`, close: () => app.close() };
}

export interface HttpResult<T = unknown> { status: number; body: T; text: string }

export async function http<T = unknown>(
  baseUrl: string,
  method: string,
  path: string,
  options: { token?: string | undefined; body?: unknown; raw?: { contentType: string; data: Uint8Array } | undefined; headers?: Record<string, string> | undefined } = {},
): Promise<HttpResult<T>> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  let body: string | Uint8Array | undefined;
  if (options.body !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(options.body); }
  if (options.raw) { headers["Content-Type"] = options.raw.contentType; body = options.raw.data; }
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = body as BodyInit;
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let parsed: unknown = text;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* texto plano */ }
  return { status: response.status, body: parsed as T, text };
}

export async function login(baseUrl: string, email: string, password = TEST_PASSWORD): Promise<string> {
  const result = await http<{ accessToken?: string; token?: string }>(baseUrl, "POST", "/api/auth/login", { body: { email, password } });
  const token = result.body?.accessToken ?? result.body?.token;
  if (result.status !== 200 || !token) throw new Error(`Login falló para ${email}: ${result.status} ${result.text}`);
  return token;
}

// ---------------------------------------------------------------------------
// Datos de prueba (SQL directo; sin pasar por endpoints que aún no existen)
// ---------------------------------------------------------------------------

let passwordHashCache: string | null = null;
async function passwordHash(): Promise<string> {
  passwordHashCache ??= await hashPassword(TEST_PASSWORD);
  return passwordHashCache;
}

export async function insertUser(db: TestDatabase, input: { email: string; role: UserRole; storeId?: string | null; status?: string }): Promise<string> {
  const id = randomUUID();
  await db.query(
    `insert into app_users (id, first_name, last_name, email, password_hash, role, customer_type, status, store_id, created_at, updated_at)
     values ($1, 'Test', $2, $3, $4, $5, $6, $7, $8, now(), now())`,
    [id, input.role, input.email.toLowerCase(), await passwordHash(), input.role, input.role === "CUSTOMER" ? "B2C" : null, input.status ?? "ACTIVE", input.storeId ?? null],
  );
  return id;
}

export interface SeededTenant {
  ownerId: string;
  ownerEmail: string;
  companyId: string;
  storeId: string;
  warehouseId: string;
  categoryId: string;
  productId: string;
  variantId: string;
  managerId: string;
  managerEmail: string;
  label: string;
}

/** Propietario + compañía + sucursal + almacén + categoría + producto/variante con stock + encargado. */
export async function seedTenant(db: TestDatabase, label: string, options: { planCode?: string } = {}): Promise<SeededTenant> {
  const tag = label.toLowerCase();
  const ownerEmail = `owner-${tag}@test.local`;
  const ownerId = await insertUser(db, { email: ownerEmail, role: "ADMIN" });
  const companyId = randomUUID();
  await db.query(
    "insert into companies (id, code, name, slug, active, owner_user_id, created_at, updated_at) values ($1, $2, $3, $4, true, $5, now(), now())",
    [companyId, `CO_${label}`.toUpperCase(), `Compania ${label}`, `compania-${tag}`, ownerId],
  );
  const storeId = randomUUID();
  await db.query("insert into stores (id, code, name, active, company_id, created_at, updated_at) values ($1, $2, $3, true, $4, now(), now())", [storeId, `S_${label}`.toUpperCase(), `Sucursal ${label}`, companyId]);
  const warehouseId = randomUUID();
  await db.query(
    "insert into warehouses (id, store_id, code, name, active, default_warehouse, created_at, updated_at) values ($1, $2, $3, $4, true, true, now(), now())",
    [warehouseId, storeId, `W_${label}`.toUpperCase(), `Almacen ${label}`],
  );
  const categoryId = randomUUID();
  await db.query("insert into categories (id, company_id, name, slug, active, created_at, updated_at) values ($1, $2, $3, $4, true, now(), now())", [categoryId, companyId, `Categoria ${label}`, `categoria-${tag}`]);
  const productId = randomUUID();
  await db.query(
    "insert into products (id, company_id, category_id, name, slug, description, status, created_at, updated_at) values ($1, $2, $3, $4, $5, 'x', 'ACTIVE', now(), now())",
    [productId, companyId, categoryId, `Producto ${label}`, `producto-${tag}`],
  );
  const variantId = randomUUID();
  await db.query(
    "insert into product_variants (id, product_id, sku, size, color, price, currency, active, created_at, updated_at) values ($1, $2, $3, 'M', 'Negro', 100, 'BOB', true, now(), now())",
    [variantId, productId, `SKU-${label}`.toUpperCase()],
  );
  await db.query(
    "insert into inventory_stocks (id, warehouse_id, variant_id, physical_quantity, committed_quantity, created_at, updated_at) values ($1, $2, $3, 50, 0, now(), now())",
    [randomUUID(), warehouseId, variantId],
  );
  const managerEmail = `manager-${tag}@test.local`;
  const managerId = await insertUser(db, { email: managerEmail, role: "STORE_MANAGER", storeId });
  if (options.planCode) await subscribe(db, ownerId, options.planCode);
  return { ownerId, ownerEmail, companyId, storeId, warehouseId, categoryId, productId, variantId, managerId, managerEmail, label };
}

export async function subscribe(db: TestDatabase, ownerId: string, planCode: string, options: { status?: string; periodEnd?: Date | null } = {}): Promise<void> {
  await db.query(
    `insert into subscriptions (id, owner_user_id, company_id, plan_id, status, current_period_start, current_period_end, grandfathered, created_at, updated_at)
     select $1, $2, null, id, $4, now() - interval '1 day', $5, false, now(), now() from plans where code = $3`,
    [randomUUID(), ownerId, planCode, options.status ?? "ACTIVE", options.periodEnd === undefined ? null : options.periodEnd],
  );
}

// ---------------------------------------------------------------------------
// Reflexión de rutas
// ---------------------------------------------------------------------------

export interface RouteInfo { method: string; path: string; roles: UserRole[]; controller: string; handler: string }

function joinPath(...parts: string[]): string {
  return `/${parts.map((part) => part.replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/")}`;
}

/** Enumera todas las rutas registradas en Nest con sus roles efectivos (handler > clase). */
export function listRoutes(app: INestApplication): RouteInfo[] {
  const routes: RouteInfo[] = [];
  const modules = app.get(ModulesContainer);
  for (const module of modules.values()) {
    for (const wrapper of module.controllers.values()) {
      const type = wrapper.metatype as (new (...args: never[]) => unknown) | null;
      if (!type) continue;
      const classPaths = ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, type) ?? "");
      const classRoles = (Reflect.getMetadata(REQUIRED_ROLES_KEY, type) ?? []) as UserRole[];
      const prototype = type.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(prototype)) {
        if (name === "constructor") continue;
        const handler = prototype[name];
        if (typeof handler !== "function") continue;
        const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (requestMethod === undefined) continue;
        const handlerPaths = ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, handler) ?? "");
        const handlerRoles = Reflect.getMetadata(REQUIRED_ROLES_KEY, handler) as UserRole[] | undefined;
        for (const classPath of classPaths) {
          for (const handlerPath of handlerPaths) {
            routes.push({
              method: RequestMethod[requestMethod],
              path: joinPath(classPath, handlerPath),
              roles: handlerRoles && handlerRoles.length > 0 ? handlerRoles : classRoles,
              controller: type.name,
              handler: name,
            });
          }
        }
      }
    }
  }
  return routes.sort((a, b) => `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`));
}

/** Cuerpo multipart/form-data mínimo (campos de texto + un archivo) para las rutas con FileInterceptor. */
export function multipart(fields: Record<string, string>, file?: { name: string; filename: string; contentType: string; data: Uint8Array }): { contentType: string; data: Uint8Array } {
  const boundary = `----velora${randomBytes(8).toString("hex")}`;
  const crlf = "\r\n";
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}${crlf}Content-Disposition: form-data; name="${name}"${crlf}${crlf}${value}${crlf}`));
  }
  if (file) {
    parts.push(Buffer.from(`--${boundary}${crlf}Content-Disposition: form-data; name="${file.name}"; filename="${file.filename}"${crlf}Content-Type: ${file.contentType}${crlf}${crlf}`));
    parts.push(Buffer.from(file.data));
    parts.push(Buffer.from(crlf));
  }
  parts.push(Buffer.from(`--${boundary}--${crlf}`));
  return { contentType: `multipart/form-data; boundary=${boundary}`, data: Buffer.concat(parts) };
}

/** PNG 1×1 válido (comprobantes e imágenes de prueba). */
export const TINY_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
