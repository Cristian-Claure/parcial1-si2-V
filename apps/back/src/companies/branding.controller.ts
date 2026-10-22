import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors, HttpStatus } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { directoryQuerySchema, updateBrandingRequestSchema, type AdminBrandingResponse, type CompanyBrand, type DirectoryEntry, type DirectoryQuery, type UpdateBrandingRequest } from "@velora/contracts";
import { BearerAuthGuard } from "../auth/bearer-auth.guard.js";
import { RequireRoles } from "../common/authz/roles.decorator.js";
import { RolesGuard } from "../common/authz/roles.guard.js";
import { TenantScopeService } from "../common/authz/tenant-scope.service.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import type { AuthenticatedRequest } from "../common/http/authenticated-request.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { MAX_TRY_ON_INPUT_BYTES } from "../common/media/image-validation.js";
import { BrandingService, type BrandAssetKind, type BrandUploadedFile } from "./branding.service.js";

interface BinaryResponse { setHeader(name: string, value: string | number): void; status(code: number): { send(body: Buffer): void } }

function assetKind(value: string): BrandAssetKind {
  if (value !== "logo" && value !== "banner") throw new ApiHttpError(404, "Recurso de marca no encontrado.");
  return value;
}

@Controller("api/companies")
export class PublicBrandingController {
  constructor(private readonly branding: BrandingService) {}

  /** Directorio público de la plataforma (/tiendas): solo campos de marca. */
  @Get("directory") directory(@Query(new ZodValidationPipe(directoryQuerySchema)) query: DirectoryQuery): Promise<DirectoryEntry[]> {
    return this.branding.directory(query);
  }

  /** /t/:slug → marca efectiva pública de la tienda. */
  @Get("by-slug/:slug") bySlug(@Param("slug") slug: string): Promise<CompanyBrand> {
    return this.branding.publicBySlug(slug);
  }

  @Get("assets/:storageKey") async asset(@Param("storageKey") storageKey: string, @Res() response: BinaryResponse): Promise<void> {
    const asset = await this.branding.publicAsset(storageKey);
    response.setHeader("Content-Type", asset.contentType);
    response.setHeader("Content-Length", asset.sizeBytes);
    response.setHeader("Cache-Control", "public, max-age=3600");
    response.status(HttpStatus.OK).send(asset.bytes);
  }
}

@Controller("api/admin/companies/:companyId/branding")
@UseGuards(BearerAuthGuard, RolesGuard)
@RequireRoles("ADMIN")
export class AdminBrandingController {
  constructor(private readonly branding: BrandingService, private readonly scope: TenantScopeService) {}

  @Get() async get(@Req() request: AuthenticatedRequest, @Param("companyId", new ParseUUIDPipe()) companyId: string): Promise<AdminBrandingResponse> {
    return this.branding.adminBranding(await this.actor(request), companyId);
  }

  @Patch() async update(@Req() request: AuthenticatedRequest, @Param("companyId", new ParseUUIDPipe()) companyId: string, @Body(new ZodValidationPipe(updateBrandingRequestSchema)) body: UpdateBrandingRequest): Promise<AdminBrandingResponse> {
    return this.branding.updateBranding(await this.actor(request), companyId, body);
  }

  @Post(":asset") @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_TRY_ON_INPUT_BYTES } }))
  async upload(@Req() request: AuthenticatedRequest, @Param("companyId", new ParseUUIDPipe()) companyId: string, @Param("asset") asset: string, @UploadedFile() file: BrandUploadedFile | undefined): Promise<AdminBrandingResponse> {
    return this.branding.uploadAsset(await this.actor(request), companyId, assetKind(asset), file);
  }

  @Delete(":asset") async remove(@Req() request: AuthenticatedRequest, @Param("companyId", new ParseUUIDPipe()) companyId: string, @Param("asset") asset: string): Promise<AdminBrandingResponse> {
    return this.branding.removeAsset(await this.actor(request), companyId, assetKind(asset));
  }

  private actor(request: AuthenticatedRequest) {
    if (!request.authPrincipal) throw new ApiHttpError(401, "No autenticado.");
    return this.scope.resolve(request.authPrincipal);
  }
}
