import { Injectable } from "@nestjs/common";
import { and, asc, eq, ilike, ne, notLike, or, type SQL } from "drizzle-orm";
import { companies, type DatabaseBrandPalette, type DatabaseCompanyContact } from "@velora/database";
import {
  brandingAllows, companyContactSchema, resolveBrandPalette, validateBrandPalette,
  type AdminBrandingResponse, type BrandingField, type BrandingTier, type CompanyBrand, type CompanySegment, type DirectoryEntry, type DirectoryQuery, type UpdateBrandingRequest,
} from "@velora/contracts";
import { assertCompanyAccess, type ActorAccessContext } from "../common/authz/tenant-scope.service.js";
import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import { validateImageBuffer, MAX_TRY_ON_INPUT_BYTES } from "../common/media/image-validation.js";
import { DatabaseService } from "../database/database.service.js";
import { PlanLimitsService } from "../plans/plan-limits.service.js";
import { ManagedAssetStorageService, type LoadedManagedAsset } from "../storage/managed-asset-storage.service.js";

export const PLATFORM_BRAND_CODE = "VELORA";
const RESERVED_SLUGS = new Set(["admin", "api", "planes", "crear-tienda", "plataforma", "sucursal", "login", "registro", "t", "tiendas", "elegir-empresa"]);
const FIELD_LABEL: Record<BrandingField, string> = {
  displayName: "el nombre comercial", slug: "el enlace", logo: "el logo", accent: "el color de acento", fullPalette: "la paleta completa",
  tagline: "la frase de marca", banner: "el banner", contact: "los datos de contacto y redes",
};

export type BrandAssetKind = "logo" | "banner";

export interface BrandUploadedFile { buffer: Buffer; mimetype: string; originalname: string; size: number }

const brandSelection = {
  id: companies.id, code: companies.code, name: companies.name, slug: companies.slug, active: companies.active,
  displayName: companies.displayName, tagline: companies.tagline, logoStorageKey: companies.logoStorageKey,
  bannerStorageKey: companies.bannerStorageKey, brandPalette: companies.brandPalette, contact: companies.contact, segment: companies.segment, listed: companies.listed,
};
type BrandRow = { id: string; code: string; name: string; slug: string; active: boolean; displayName: string | null; tagline: string | null; logoStorageKey: string | null; bannerStorageKey: string | null; brandPalette: DatabaseBrandPalette | null; contact: DatabaseCompanyContact | null; segment: CompanySegment | null; listed: boolean };

/**
 * Marca por compañía. Lo guardado no se borra al bajar de plan: la marca PÚBLICA se
 * filtra al leerla según el branding_tier vigente; la edición rechaza campos fuera del nivel.
 */
@Injectable()
export class BrandingService {
  constructor(
    private readonly database: DatabaseService,
    private readonly limits: PlanLimitsService,
    private readonly storage: ManagedAssetStorageService,
    private readonly config: RuntimeConfigService,
  ) {}

  async brandById(companyId: string): Promise<CompanyBrand | null> {
    const row = await this.row(eq(companies.id, companyId));
    return row ? this.toBrand(row, await this.limits.brandingTier(row.id)) : null;
  }

  async publicBySlug(slug: string): Promise<CompanyBrand> {
    const row = await this.row(eq(companies.slug, slug.trim().toLowerCase()));
    if (!row || !row.active) throw new ApiHttpError(404, "Tienda no encontrada.");
    return this.toBrand(row, await this.limits.brandingTier(row.id));
  }

  async adminBranding(actor: ActorAccessContext, companyId: string): Promise<AdminBrandingResponse> {
    assertCompanyAccess(actor, companyId);
    const row = await this.requireRow(companyId);
    const tier = await this.limits.brandingTier(companyId);
    return {
      brand: this.toBrand(row, tier),
      stored: {
        displayName: row.displayName, slug: row.slug, tagline: row.tagline, palette: row.brandPalette, contact: row.contact,
        hasLogo: row.logoStorageKey !== null, hasBanner: row.bannerStorageKey !== null, segment: row.segment,
      },
      allowed: (["displayName", "slug", "logo", "accent", "fullPalette", "tagline", "banner", "contact"] as const).filter((field) => brandingAllows(tier, field)),
    };
  }

  async updateBranding(actor: ActorAccessContext, companyId: string, request: UpdateBrandingRequest): Promise<AdminBrandingResponse> {
    assertCompanyAccess(actor, companyId);
    const row = await this.requireRow(companyId);
    const tier = await this.limits.brandingTier(companyId);
    const palette = request.palette;
    const requested: BrandingField[] = [];
    if (request.displayName !== undefined) requested.push("displayName");
    if (request.slug !== undefined && request.slug !== row.slug) requested.push("slug");
    if (request.tagline !== undefined && request.tagline !== row.tagline) requested.push("tagline");
    if (request.contact !== undefined) requested.push("contact");
    if (palette) {
      requested.push("accent");
      if (palette.primary !== undefined || palette.paper !== undefined || palette.ink !== undefined) requested.push("fullPalette");
    }
    for (const field of requested) await this.assertAllowed(tier, field);

    const nextPalette: DatabaseBrandPalette | null = palette
      ? { accent: palette.accent.toUpperCase(), ...(palette.primary ? { primary: palette.primary.toUpperCase() } : {}), ...(palette.paper ? { paper: palette.paper.toUpperCase() } : {}), ...(palette.ink ? { ink: palette.ink.toUpperCase() } : {}) }
      : row.brandPalette;
    if (palette) {
      const issues = validateBrandPalette(nextPalette ?? { accent: palette.accent });
      if (issues.length > 0) {
        throw ApiHttpError.coded(400, "BRAND_CONTRAST", "La paleta no cumple el contraste mínimo WCAG AA.", { issues });
      }
    }
    if (request.slug !== undefined && request.slug !== row.slug) await this.assertSlugAvailable(request.slug, companyId);

    await this.database.db.update(companies).set({
      ...(request.displayName !== undefined ? { displayName: request.displayName.trim() } : {}),
      ...(request.slug !== undefined ? { slug: request.slug } : {}),
      ...(request.tagline !== undefined ? { tagline: request.tagline?.trim() || null } : {}),
      ...(request.contact !== undefined ? { contact: request.contact ? (companyContactSchema.parse(request.contact) as DatabaseCompanyContact) : null } : {}),
      ...(palette ? { brandPalette: nextPalette } : {}),
      // El segmento no depende del nivel de marca: solo clasifica la tienda en el directorio.
      ...(request.segment !== undefined ? { segment: request.segment } : {}),
      updatedAt: new Date(),
    }).where(eq(companies.id, companyId));
    return this.adminBranding(actor, companyId);
  }

  async uploadAsset(actor: ActorAccessContext, companyId: string, kind: BrandAssetKind, file: BrandUploadedFile | undefined): Promise<AdminBrandingResponse> {
    assertCompanyAccess(actor, companyId);
    const row = await this.requireRow(companyId);
    await this.assertAllowed(await this.limits.brandingTier(companyId), kind);
    if (!file) throw new ApiHttpError(400, "Adjunte una imagen PNG, JPG o WEBP.");
    const image = validateImageBuffer(file.buffer, file.mimetype, kind === "logo" ? "El logo" : "El banner", MAX_TRY_ON_INPUT_BYTES);
    const stored = await this.storage.store(image.bytes, image.contentType);
    const previous = kind === "logo" ? row.logoStorageKey : row.bannerStorageKey;
    await this.database.db.update(companies).set(kind === "logo" ? { logoStorageKey: stored.storageKey, updatedAt: new Date() } : { bannerStorageKey: stored.storageKey, updatedAt: new Date() })
      .where(eq(companies.id, companyId));
    if (previous) await this.storage.delete(previous).catch(() => undefined);
    return this.adminBranding(actor, companyId);
  }

  async removeAsset(actor: ActorAccessContext, companyId: string, kind: BrandAssetKind): Promise<AdminBrandingResponse> {
    assertCompanyAccess(actor, companyId);
    const row = await this.requireRow(companyId);
    const previous = kind === "logo" ? row.logoStorageKey : row.bannerStorageKey;
    await this.database.db.update(companies).set(kind === "logo" ? { logoStorageKey: null, updatedAt: new Date() } : { bannerStorageKey: null, updatedAt: new Date() })
      .where(eq(companies.id, companyId));
    if (previous) await this.storage.delete(previous).catch(() => undefined);
    return this.adminBranding(actor, companyId);
  }

  /** Solo sirve claves referenciadas por alguna compañía (logo o banner). */
  async publicAsset(storageKey: string): Promise<LoadedManagedAsset> {
    const referenced = await this.database.db.select({ id: companies.id }).from(companies)
      .where(or(eq(companies.logoStorageKey, storageKey), eq(companies.bannerStorageKey, storageKey))).limit(1);
    if (referenced.length === 0) throw new ApiHttpError(404, "Asset no encontrado.");
    try { return await this.storage.load(storageKey); } catch { throw new ApiHttpError(404, "Asset no encontrado."); }
  }

  /**
   * Directorio público (Fase 4B): tiendas activas y listadas, sin las de las demos automáticas
   * (`demo-*`). Solo campos de marca, filtrados por el nivel de marca vigente de cada tienda.
   */
  async directory(query: DirectoryQuery): Promise<DirectoryEntry[]> {
    const conditions: SQL[] = [eq(companies.active, true), eq(companies.listed, true), notLike(companies.slug, "demo-%")];
    if (query.segment) conditions.push(eq(companies.segment, query.segment));
    if (query.q) {
      // Los comodines del usuario (% _ \) se escapan: la búsqueda es literal.
      const pattern = `%${query.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
      conditions.push(or(ilike(companies.name, pattern), ilike(companies.displayName, pattern), ilike(companies.tagline, pattern), ilike(companies.slug, pattern))!);
    }
    const rows = await this.database.db.select(brandSelection).from(companies).where(and(...conditions)).orderBy(asc(companies.name)).limit(100) as BrandRow[];
    return Promise.all(rows.map(async (row) => {
      const brand = this.toBrand(row, await this.limits.brandingTier(row.id));
      return { slug: brand.slug, name: brand.name, tagline: brand.tagline, segment: row.segment, logoUrl: brand.logoUrl, bannerUrl: brand.bannerUrl, palette: brand.palette };
    }));
  }

  /** Bytes del logo para documentos exportados (PDF); null si no hay logo o no se puede leer. */
  async logoAsset(companyId: string): Promise<{ bytes: Buffer; contentType: string } | null> {
    const row = await this.row(eq(companies.id, companyId));
    if (!row?.logoStorageKey) return null;
    try {
      const asset = await this.storage.load(row.logoStorageKey);
      return { bytes: asset.bytes, contentType: asset.contentType };
    } catch {
      return null;
    }
  }

  toBrand(row: BrandRow, tier: BrandingTier): CompanyBrand {
    const stored = row.brandPalette;
    const palette = resolveBrandPalette(stored ? (brandingAllows(tier, "fullPalette") ? stored : { accent: stored.accent }) : null);
    const contact = brandingAllows(tier, "contact") && row.contact ? companyContactSchema.safeParse(row.contact) : null;
    return {
      companyId: row.id, code: row.code, slug: row.slug, name: row.displayName ?? row.name,
      isPlatformBrand: row.code === PLATFORM_BRAND_CODE, tier,
      logoUrl: row.logoStorageKey ? this.assetUrl(row.logoStorageKey) : null,
      bannerUrl: brandingAllows(tier, "banner") && row.bannerStorageKey ? this.assetUrl(row.bannerStorageKey) : null,
      tagline: brandingAllows(tier, "tagline") ? row.tagline : null,
      contact: contact?.success ? contact.data : null,
      palette,
    };
  }

  private assetUrl(storageKey: string): string {
    return `${this.config.value.VELORA_PUBLIC_BACKEND_URL.replace(/\/$/, "")}/api/companies/assets/${storageKey}`;
  }

  private async assertAllowed(tier: BrandingTier, field: BrandingField): Promise<void> {
    if (brandingAllows(tier, field)) return;
    const requiredPlan = await this.limits.requiredPlanFor((plan) => brandingAllows(plan.brandingTier, field));
    throw ApiHttpError.coded(402, "PLAN_LIMIT_BRANDING", `Tu plan no permite personalizar ${FIELD_LABEL[field]}.${requiredPlan ? ` Disponible en ${requiredPlan}.` : ""}`, { feature: field, requiredPlan });
  }

  private async assertSlugAvailable(slug: string, companyId: string): Promise<void> {
    const taken = await this.database.db.select({ id: companies.id }).from(companies).where(and(eq(companies.slug, slug), ne(companies.id, companyId))).limit(1);
    if (taken.length > 0 || RESERVED_SLUGS.has(slug)) throw ApiHttpError.coded(409, "SLUG_TAKEN", "Ese enlace de tienda no está disponible.", { suggestion: null });
  }

  private async requireRow(companyId: string): Promise<BrandRow> {
    const row = await this.row(eq(companies.id, companyId));
    if (!row) throw new ApiHttpError(404, "Compañía no encontrada.");
    return row;
  }

  private async row(condition: ReturnType<typeof eq>): Promise<BrandRow | null> {
    const rows = await this.database.db.select(brandSelection).from(companies).where(condition).limit(1);
    return (rows[0] as BrandRow | undefined) ?? null;
  }
}
