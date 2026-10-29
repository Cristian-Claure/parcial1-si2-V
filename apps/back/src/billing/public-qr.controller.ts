import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from "@nestjs/common";
import { qrTokenRequestSchema, type PublicQrCharge, type QrActionResponse, type QrTokenRequest } from "@velora/contracts";
import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import type { AuthenticatedRequest } from "../common/http/authenticated-request.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { QrChargeService } from "./qr-charge.service.js";

/**
 * "Banco demo" (público): se abre desde el QR DEMO con su token firmado.
 * 403 token inválido · 410 vencido · 429 demasiados intentos por IP. Sin sesión de usuario.
 */
@Controller("api/pay/qr")
export class PublicQrController {
  constructor(private readonly qr: QrChargeService, private readonly config: RuntimeConfigService) {}

  @Get(":reference") view(@Req() request: AuthenticatedRequest, @Param("reference") reference: string, @Query("t") token: string | undefined): Promise<PublicQrCharge> {
    return this.qr.publicView(reference, token ?? "", this.clientIp(request));
  }

  @Post(":reference/confirm") @HttpCode(HttpStatus.OK)
  confirm(@Req() request: AuthenticatedRequest, @Param("reference") reference: string, @Body(new ZodValidationPipe(qrTokenRequestSchema)) body: QrTokenRequest): Promise<QrActionResponse> {
    return this.qr.act(reference, body.token, this.clientIp(request), "PAY");
  }

  @Post(":reference/cancel") @HttpCode(HttpStatus.OK)
  cancel(@Req() request: AuthenticatedRequest, @Param("reference") reference: string, @Body(new ZodValidationPipe(qrTokenRequestSchema)) body: QrTokenRequest): Promise<QrActionResponse> {
    return this.qr.act(reference, body.token, this.clientIp(request), "CANCEL");
  }

  private clientIp(request: AuthenticatedRequest): string {
    if (this.config.value.VELORA_RATE_LIMIT_TRUST_PROXY_HEADERS) {
      const forwarded = request.headers["x-forwarded-for"];
      const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
      if (first) return first;
    }
    return request.socket?.remoteAddress ?? "unknown";
  }
}
