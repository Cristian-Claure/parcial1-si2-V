import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  TRANSFER_PROOF_MAX_BYTES, createPlanPaymentRequestSchema, platformBillingSettingsSchema, platformPaymentsQuerySchema, reviewPaymentRequestSchema, transferProofFieldsSchema,
  type CreatePlanPaymentRequest, type PlanPayment, type PlanPaymentOptionsResponse, type PlanPaymentResponse, type PlatformBillingSettingsInput,
  type PlatformBillingSettingsResponse, type PlatformPayment, type PlatformPaymentsQuery, type ReviewPaymentRequest, type TransferProofFields,
} from "@velora/contracts";
import { BearerAuthGuard } from "../auth/bearer-auth.guard.js";
import { RequireRoles } from "../common/authz/roles.decorator.js";
import { RolesGuard } from "../common/authz/roles.guard.js";
import { TenantScopeService, type ActorAccessContext } from "../common/authz/tenant-scope.service.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import type { AuthenticatedRequest } from "../common/http/authenticated-request.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import type { LoadedManagedAsset } from "../storage/managed-asset-storage.service.js";
import { PlanPaymentsService, type UploadedProofFile } from "./plan-payments.service.js";
import { PlatformBillingService } from "./platform-billing.service.js";

interface BinaryResponse { setHeader(name: string, value: string | number): void; status(code: number): { send(body: Buffer): void } }

function sendBinary(response: BinaryResponse, asset: Pick<LoadedManagedAsset, "contentType" | "bytes">, cache: string, filename?: string): void {
  response.setHeader("Content-Type", asset.contentType);
  response.setHeader("Content-Length", asset.bytes.byteLength);
  response.setHeader("Cache-Control", cache);
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (filename) response.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  response.status(HttpStatus.OK).send(asset.bytes);
}

async function actorOf(scope: TenantScopeService, request: AuthenticatedRequest): Promise<ActorAccessContext> {
  if (!request.authPrincipal) throw new ApiHttpError(401, "No autenticado.");
  return scope.resolve(request.authPrincipal);
}

/** Mi plan → mejorar o renovar → método de pago → resultado (el titular sale de la BD vía TenantScopeService). */
@Controller("api/admin/plan")
@UseGuards(BearerAuthGuard, RolesGuard)
@RequireRoles("ADMIN")
export class AdminPlanPaymentsController {
  constructor(private readonly payments: PlanPaymentsService, private readonly scope: TenantScopeService) {}

  @Get("payment-options") async options(@Req() request: AuthenticatedRequest): Promise<PlanPaymentOptionsResponse> {
    await this.owner(request);
    return this.payments.options();
  }

  @Post("payments") async create(@Req() request: AuthenticatedRequest, @Body(new ZodValidationPipe(createPlanPaymentRequestSchema)) body: CreatePlanPaymentRequest): Promise<PlanPaymentResponse> {
    return this.payments.create(await this.owner(request), body);
  }

  @Get("payments") async list(@Req() request: AuthenticatedRequest): Promise<PlanPayment[]> {
    return this.payments.list(await this.owner(request));
  }

  @Get("payments/:paymentId") async get(@Req() request: AuthenticatedRequest, @Param("paymentId", new ParseUUIDPipe()) paymentId: string): Promise<PlanPaymentResponse> {
    return this.payments.get(await this.owner(request), paymentId);
  }

  @Post("payments/:paymentId/cancel") @HttpCode(HttpStatus.OK)
  async cancel(@Req() request: AuthenticatedRequest, @Param("paymentId", new ParseUUIDPipe()) paymentId: string): Promise<PlanPaymentResponse> {
    return this.payments.cancel(await this.owner(request), paymentId);
  }

  @Post("payments/:paymentId/transfer-proof") @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: TRANSFER_PROOF_MAX_BYTES } }))
  async proof(
    @Req() request: AuthenticatedRequest,
    @Param("paymentId", new ParseUUIDPipe()) paymentId: string,
    @Body(new ZodValidationPipe(transferProofFieldsSchema)) body: TransferProofFields,
    @UploadedFile() file: UploadedProofFile | undefined,
  ): Promise<PlanPaymentResponse> {
    return this.payments.submitProof(await this.owner(request), paymentId, file, body.operationNumber);
  }

  @Get("payments/:paymentId/receipt")
  async receipt(@Req() request: AuthenticatedRequest, @Param("paymentId", new ParseUUIDPipe()) paymentId: string, @Res() response: BinaryResponse): Promise<void> {
    const { filename, pdf } = await this.payments.receipt(await this.owner(request), paymentId);
    sendBinary(response, { contentType: "application/pdf", bytes: pdf }, "private, no-store", filename);
  }

  private async owner(request: AuthenticatedRequest): Promise<string> {
    return (await actorOf(this.scope, request)).userId;
  }
}

/** Comprobantes de transferencia: privados (dueño del pago o PLATFORM_ADMIN), nunca por la ruta pública de assets. */
@Controller("api/billing")
@UseGuards(BearerAuthGuard, RolesGuard)
@RequireRoles("ADMIN", "PLATFORM_ADMIN")
export class BillingProofController {
  constructor(private readonly platform: PlatformBillingService, private readonly scope: TenantScopeService) {}

  @Get("payments/:paymentId/proof")
  async proof(@Req() request: AuthenticatedRequest, @Param("paymentId", new ParseUUIDPipe()) paymentId: string, @Query("proofId") proofId: string | undefined, @Res() response: BinaryResponse): Promise<void> {
    if (proofId !== undefined && !/^[0-9a-f-]{36}$/i.test(proofId)) throw new ApiHttpError(400, "Comprobante inválido.");
    const asset = await this.platform.proof(await actorOf(this.scope, request), paymentId, proofId);
    sendBinary(response, asset, "private, no-store");
  }
}

/** QR estático de la cuenta de cobro (público por diseño: lo ve quien va a transferir). */
@Controller("api/billing")
export class PublicTransferQrController {
  constructor(private readonly platform: PlatformBillingService) {}

  @Get("transfer-qr/:storageKey")
  async image(@Param("storageKey") storageKey: string, @Res() response: BinaryResponse): Promise<void> {
    sendBinary(response, await this.platform.transferQrImage(storageKey), "public, max-age=300");
  }
}

/** /plataforma/cobros y /plataforma/pagos. */
@Controller("api/platform")
@UseGuards(BearerAuthGuard, RolesGuard)
@RequireRoles("PLATFORM_ADMIN")
export class PlatformBillingController {
  constructor(private readonly platform: PlatformBillingService, private readonly scope: TenantScopeService) {}

  @Get("billing-settings") async settings(@Req() request: AuthenticatedRequest): Promise<PlatformBillingSettingsResponse> {
    await this.requirePlatform(request);
    return this.platform.settings();
  }

  @Put("billing-settings") async update(@Req() request: AuthenticatedRequest, @Body(new ZodValidationPipe(platformBillingSettingsSchema)) body: PlatformBillingSettingsInput): Promise<PlatformBillingSettingsResponse> {
    return this.platform.updateSettings(await this.requirePlatform(request), body);
  }

  @Post("billing-settings/qr-image") @HttpCode(HttpStatus.OK) @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 2 * 1024 * 1024 } }))
  async uploadQr(@Req() request: AuthenticatedRequest, @UploadedFile() file: { buffer: Buffer; mimetype: string } | undefined): Promise<PlatformBillingSettingsResponse> {
    const actor = await this.requirePlatform(request);
    if (!file) throw new ApiHttpError(400, "Adjunte la imagen del QR.");
    return this.platform.replaceQrImage(actor, file);
  }

  @Delete("billing-settings/qr-image") async removeQr(@Req() request: AuthenticatedRequest): Promise<PlatformBillingSettingsResponse> {
    return this.platform.replaceQrImage(await this.requirePlatform(request), null);
  }

  @Get("payments") async queue(@Req() request: AuthenticatedRequest, @Query(new ZodValidationPipe(platformPaymentsQuerySchema)) query: PlatformPaymentsQuery): Promise<PlatformPayment[]> {
    await this.requirePlatform(request);
    return this.platform.queue(query);
  }

  @Post("payments/:paymentId/review") @HttpCode(HttpStatus.OK)
  async review(@Req() request: AuthenticatedRequest, @Param("paymentId", new ParseUUIDPipe()) paymentId: string, @Body(new ZodValidationPipe(reviewPaymentRequestSchema)) body: ReviewPaymentRequest): Promise<PlatformPayment> {
    return this.platform.review(await this.requirePlatform(request), paymentId, body);
  }

  /** El rol se verifica también contra la BD (cuenta activa), no solo con el JWT. */
  private async requirePlatform(request: AuthenticatedRequest): Promise<string> {
    const actor = await actorOf(this.scope, request);
    if (actor.role !== "PLATFORM_ADMIN") throw new ApiHttpError(403, "Se requiere rol PLATFORM_ADMIN.");
    return actor.userId;
  }
}
