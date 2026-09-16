import {
  Injectable,
} from "@nestjs/common";

import {
  z,
} from "zod";

import {
  reportEntityIdSchema,
} from "@velora/contracts";

import type {
  AdminReportAiNarrativeRequest,
  AdminReportAiQueryRequest,
  ManagerReportAiNarrativeRequest,
  ManagerReportAiQueryRequest,
  ReportAiIntent,
  ReportAiNarrativeResponse,
  ReportAiQueryResponse,
  ReportOverview,
  ReportVoiceTranscriptionResponse,
} from "@velora/contracts";

import type {
  AuthPrincipal,
} from "../auth/security.js";

import {
  RuntimeConfigService,
} from "../common/config/runtime-config.service.js";

import {
  ApiHttpError,
} from "../common/http/api-http.error.js";

import {
  ReportsService,
  type ReportStoreOption,
} from "./reports.service.js";

const REPORT_ZONE =
  "America/La_Paz";

const MAX_AUDIO_BYTES =
  8 *
  1024 *
  1024;

const SUPPORTED_AUDIO_TYPES =
  new Map<
    string,
    string
  >([
    [
      "audio/webm",
      "webm",
    ],
    [
      "video/webm",
      "webm",
    ],
    [
      "audio/mp4",
      "mp4",
    ],
    [
      "audio/x-m4a",
      "m4a",
    ],
    [
      "audio/mpeg",
      "mp3",
    ],
    [
      "audio/wav",
      "wav",
    ],
    [
      "audio/x-wav",
      "wav",
    ],
    [
      "audio/ogg",
      "ogg",
    ],
    [
      "audio/aac",
      "aac",
    ],
    [
      "audio/flac",
      "flac",
    ],
  ]);

const focusSchema =
  z.enum([
    "OVERVIEW",
    "SALES",
    "ORDERS",
    "PAYMENTS",
    "INVENTORY",
    "PRODUCTS",
  ]);

const chartSchema =
  z.enum([
    "AUTO",
    "LINE",
    "BAR",
    "DONUT",
    "TABLE",
  ]);

const dateOrNullSchema =
  z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
    )
    .nullable();

const intentOutputSchema =
  z.object({
    focus:
      focusSchema,
    fromDate:
      dateOrNullSchema,
    toDate:
      dateOrNullSchema,
    storeId:
      reportEntityIdSchema
        .nullable(),
    requestedChart:
      chartSchema,
  });

const narrativeOutputSchema =
  z.object({
    summary:
      z
        .string()
        .trim()
        .max(2200),
    insights:
      z
        .array(
          z
            .string()
            .trim()
            .max(700),
        )
        .max(6),
    assessment:
      z
        .string()
        .trim()
        .max(1600),
    recommendations:
      z
        .array(
          z
            .string()
            .trim()
            .max(700),
        )
        .max(4),
  });

const INTERPRET_SYSTEM_PROMPT =
  [
    "Eres el intérprete seguro de reportes operativos de VÉLORA.",
    "Tu única tarea es convertir una solicitud en lenguaje natural a una intención estructurada.",
    "REGLAS:",
    "1. No calcules KPI, ventas, stock, pedidos ni importes.",
    "2. No generes SQL.",
    "3. Sólo puedes elegir un storeId presente literalmente en AVAILABLE_STORES.",
    "4. Si no se menciona una sucursal concreta, storeId debe ser null.",
    "5. Usa currentDate para resolver referencias temporales.",
    "6. Si pide todo el histórico o desde el inicio, fromDate y toDate deben ser null.",
    "7. Si no existe referencia temporal, fromDate y toDate deben ser null.",
    "8. Un mes y año usa el primer y último día calendario del mes.",
    "9. Una comparación de varios períodos devuelve un único rango envolvente.",
    "10. Conserva exactamente los límites válidos de un rango explícito.",
    "11. Ventas/desempeño comercial=>SALES; pedidos=>ORDERS; pagos/cobros=>PAYMENTS; stock=>INVENTORY; productos/ranking=>PRODUCTS; general=>OVERVIEW.",
    "12. Si pide todas las sucursales o el negocio completo, storeId debe ser null.",
    "13. requestedChart es AUTO salvo preferencia visual explícita.",
    "14. Nunca inventes IDs de sucursal.",
    "15. Devuelve únicamente la intención estructurada; NestJS calculará todos los resultados.",
  ].join(
    "\n",
  );

const NARRATIVE_SYSTEM_PROMPT =
  [
    "Eres VÉLORA AI, analista ejecutivo de reportes operativos.",
    "Recibirás una pregunta y un reporte YA CALCULADO por NestJS.",
    "REGLAS CRÍTICAS:",
    "1. Usa únicamente hechos presentes en REPORT_FACTS.",
    "2. No recalcules ni inventes cifras, porcentajes, diferencias, promedios, ratios o importes.",
    "3. No conviertas unidades de stock en moneda.",
    "4. No generes SQL ni cambies la definición de KPI.",
    "5. sales-store es venta neta por sucursal para el período.",
    "6. orders-channel es pedidos por canal del período.",
    "7. La serie temporal puede agruparse por día, semana o mes.",
    "8. inventory-store, AVAILABLE_UNITS y LOW_STOCK_VARIANTS son una fotografía ACTUAL, no stock histórico.",
    "9. top-products corresponde a venta confirmada del período.",
    "10. Responde primero la pregunta concreta.",
    "11. Puedes emitir criterio cualitativo si está respaldado por REPORT_FACTS.",
    "12. Las recomendaciones deben ser prudentes y no inventar metas, presupuestos o pronósticos.",
    "13. Si la evidencia es insuficiente, dilo claramente.",
    "14. No digas que falta un desglose cuando existe en charts o tables.",
    "15. summary debe ser directo; insights máximo seis; assessment breve; recommendations máximo cuatro.",
    "16. Habla en español profesional, natural, claro y orientado a decisión.",
  ].join(
    "\n",
  );

const TRANSCRIPTION_PROMPT =
  "Consulta en español sobre reportes comerciales de VÉLORA. Puede mencionar ventas, pedidos, pagos, inventario, productos, POS, Ecommerce, sucursales, fechas, semanas, meses y períodos históricos.";

type AiQueryRequest =
  AdminReportAiQueryRequest |
  ManagerReportAiQueryRequest;

type AiNarrativeRequest =
  AdminReportAiNarrativeRequest |
  ManagerReportAiNarrativeRequest;

@Injectable()
export class ReportAiService {
  constructor(
    private readonly reports:
      ReportsService,
    private readonly config:
      RuntimeConfigService,
  ) {}

  async query(
    principal:
      AuthPrincipal,
    companyId:
      string |
      null,
    request:
      AiQueryRequest,
  ): Promise<ReportAiQueryResponse> {
    this.requireConfigured();

    const question =
      request.question
        .trim();

    const available =
      await this.reports
        .availableStores(
          principal,
          companyId,
        );

    const interpreted =
      await this.interpret(
        question,
        available.stores,
      );

    let safeIntent =
      this.sanitizeIntent(
        interpreted.intent,
        available.stores,
      );

    safeIntent =
      this.applyDeterministicPeriod(
        question,
        safeIntent,
      );

    const effectiveStoreId =
      safeIntent.storeId;

    const bounds =
      await this.reports
        .periodBounds(
          principal,
          available.scope.companyId,
          effectiveStoreId,
        );

    let effectiveFrom =
      safeIntent.fromDate;
    let effectiveTo =
      safeIntent.toDate;

    if (
      this.usesSelectedRange(
        question,
      )
    ) {
      effectiveFrom =
        effectiveFrom ??
        request.fromDate ??
        null;
      effectiveTo =
        effectiveTo ??
        request.toDate ??
        null;
    }

    effectiveFrom =
      effectiveFrom ??
      bounds.minDate;

    effectiveTo =
      effectiveTo ??
      bounds.maxDate;

    const report =
      await this.reports
        .overview(
          principal,
          available.scope.companyId,
          effectiveFrom,
          effectiveTo,
          effectiveStoreId,
        );

    const narrative =
      await this.narrate(
        question,
        report,
      );

    return {
      question,
      intent: {
        ...safeIntent,
        fromDate:
          report.from,
        toDate:
          report.to,
        storeId:
          effectiveStoreId,
      },
      report,
      narrative: {
        ...narrative,
        model:
          this.config.value
            .VELORA_AI_MODEL,
      },
      model:
        interpreted.model,
    };
  }

  async narrative(
    principal:
      AuthPrincipal,
    companyId:
      string |
      null,
    request:
      AiNarrativeRequest,
  ): Promise<ReportAiNarrativeResponse> {
    this.requireConfigured();

    const storeId =
      "storeId" in
        request
        ? request.storeId ??
          null
        : null;

    const report =
      await this.reports
        .overview(
          principal,
          companyId,
          request.fromDate ??
            null,
          request.toDate ??
            null,
          storeId,
        );

    const narrative =
      await this.narrate(
        request.question
          .trim(),
        report,
      );

    return {
      ...narrative,
      model:
        this.config.value
          .VELORA_AI_MODEL,
    };
  }

  async transcribe(
    principal:
      AuthPrincipal,
    companyId:
      string |
      null,
    audio:
      Buffer,
    contentType:
      string |
      undefined,
  ): Promise<ReportVoiceTranscriptionResponse> {
    this.requireConfigured();

    await this.reports
      .availableStores(
        principal,
        companyId,
      );

    if (
      !Buffer.isBuffer(
        audio,
      ) ||
      audio.length ===
        0
    ) {
      throw new ApiHttpError(
        400,
        "No se recibió audio para transcribir.",
      );
    }

    if (
      audio.length >
      MAX_AUDIO_BYTES
    ) {
      throw new ApiHttpError(
        400,
        "El audio supera el límite de 8 MB.",
      );
    }

    const normalizedType =
      (
        contentType ??
        ""
      )
        .split(
          ";",
          1,
        )[0]
        ?.trim()
        .toLowerCase() ??
      "";

    const extension =
      SUPPORTED_AUDIO_TYPES
        .get(
          normalizedType,
        );

    if (
      !extension
    ) {
      throw new ApiHttpError(
        400,
        "El formato del audio no está soportado.",
      );
    }

    const form =
      new FormData();

    form.append(
      "model",
      this.config.value
        .VELORA_AI_TRANSCRIBE_MODEL,
    );
    form.append(
      "language",
      "es",
    );
    form.append(
      "prompt",
      TRANSCRIPTION_PROMPT,
    );
    form.append(
      "file",
      new Blob(
        [
          new Uint8Array(
            audio,
          ),
        ],
        {
          type:
            normalizedType,
        },
      ),
      `velora-report.${extension}`,
    );

    let response:
      Response;

    try {
      response =
        await fetch(
          `${this.openAiBaseUrl()}/audio/transcriptions`,
          {
            method:
              "POST",
            headers: {
              Authorization:
                `Bearer ${this.apiKey()}`,
            },
            body:
              form,
            signal:
              AbortSignal.timeout(
                45_000,
              ),
          },
        );
    }
    catch {
      throw new ApiHttpError(
        503,
        "El servicio de transcripción no está disponible.",
      );
    }

    if (
      !response.ok
    ) {
      throw new ApiHttpError(
        502,
        "OpenAI no pudo transcribir la consulta por voz.",
      );
    }

    let payload:
      unknown;

    try {
      payload =
        await response
          .json();
    }
    catch {
      throw new ApiHttpError(
        502,
        "OpenAI devolvió una transcripción inválida.",
      );
    }

    const record =
      this.asRecord(
        payload,
      );

    const text =
      typeof record.text ===
        "string"
        ? record.text
            .trim()
        : "";

    if (
      !text
    ) {
      throw new ApiHttpError(
        502,
        "No se detectó voz suficiente para generar una transcripción.",
      );
    }

    return {
      text:
        text
          .slice(
            0,
            800,
          )
          .trim(),
      model:
        this.config.value
          .VELORA_AI_TRANSCRIBE_MODEL,
    };
  }

  private async interpret(
    question:
      string,
    availableStores:
      ReportStoreOption[],
  ): Promise<{
    intent:
      ReportAiIntent;
    model:
      string;
  }> {
    const currentDate =
      this.today();

    const raw =
      await this.responsesRequest(
        "velora_report_intent",
        INTERPRET_SYSTEM_PROMPT,
        JSON.stringify({
          currentDate,
          question,
          availableStores,
        }),
        {
          type:
            "object",
          additionalProperties:
            false,
          properties: {
            focus: {
              type:
                "string",
              enum:
                focusSchema.options,
            },
            fromDate: {
              anyOf: [
                {
                  type:
                    "string",
                  pattern:
                    "^\\d{4}-\\d{2}-\\d{2}$",
                },
                {
                  type:
                    "null",
                },
              ],
            },
            toDate: {
              anyOf: [
                {
                  type:
                    "string",
                  pattern:
                    "^\\d{4}-\\d{2}-\\d{2}$",
                },
                {
                  type:
                    "null",
                },
              ],
            },
            storeId: {
              anyOf: [
                {
                  type:
                    "string",
                },
                {
                  type:
                    "null",
                },
              ],
            },
            requestedChart: {
              type:
                "string",
              enum:
                chartSchema.options,
            },
          },
          required: [
            "focus",
            "fromDate",
            "toDate",
            "storeId",
            "requestedChart",
          ],
        },
        500,
      );

    const parsed =
      intentOutputSchema
        .safeParse(
          raw,
        );

    if (
      !parsed.success
    ) {
      throw new ApiHttpError(
        502,
        "OpenAI devolvió una intención de reporte inválida.",
      );
    }

    return {
      intent:
        parsed.data,
      model:
        this.config.value
          .VELORA_AI_MODEL,
    };
  }

  private async narrate(
    question:
      string,
    report:
      ReportOverview,
  ): Promise<
    Omit<
      ReportAiNarrativeResponse,
      "model"
    >
  > {
    const reportJson =
      JSON.stringify(
        report,
      );

    if (
      reportJson.length >
      60_000
    ) {
      throw new ApiHttpError(
        400,
        "El reporte es demasiado grande para análisis narrativo.",
      );
    }

    const raw =
      await this.responsesRequest(
        "velora_report_narrative",
        NARRATIVE_SYSTEM_PROMPT,
        JSON.stringify({
          question,
          reportFacts:
            report,
        }),
        {
          type:
            "object",
          additionalProperties:
            false,
          properties: {
            summary: {
              type:
                "string",
            },
            insights: {
              type:
                "array",
              maxItems:
                6,
              items: {
                type:
                  "string",
              },
            },
            assessment: {
              type:
                "string",
            },
            recommendations: {
              type:
                "array",
              maxItems:
                4,
              items: {
                type:
                  "string",
              },
            },
          },
          required: [
            "summary",
            "insights",
            "assessment",
            "recommendations",
          ],
        },
        900,
      );

    const parsed =
      narrativeOutputSchema
        .safeParse(
          raw,
        );

    if (
      !parsed.success
    ) {
      throw new ApiHttpError(
        502,
        "OpenAI devolvió una narrativa de reporte inválida.",
      );
    }

    return {
      summary:
        parsed.data
          .summary,
      insights:
        parsed.data
          .insights
          .filter(
            Boolean,
          )
          .slice(
            0,
            6,
          ),
      assessment:
        parsed.data
          .assessment,
      recommendations:
        parsed.data
          .recommendations
          .filter(
            Boolean,
          )
          .slice(
            0,
            4,
          ),
    };
  }

  private async responsesRequest(
    schemaName:
      string,
    system:
      string,
    user:
      string,
    schema:
      Record<
        string,
        unknown
      >,
    maxOutputTokens:
      number,
  ): Promise<unknown> {
    let response:
      Response;

    try {
      response =
        await fetch(
          `${this.openAiBaseUrl()}/responses`,
          {
            method:
              "POST",
            headers: {
              Authorization:
                `Bearer ${this.apiKey()}`,
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                model:
                  this.config.value
                    .VELORA_AI_MODEL,
                input: [
                  {
                    role:
                      "system",
                    content:
                      system,
                  },
                  {
                    role:
                      "user",
                    content:
                      user,
                  },
                ],
                text: {
                  format: {
                    type:
                      "json_schema",
                    name:
                      schemaName,
                    strict:
                      true,
                    schema,
                  },
                },
                max_output_tokens:
                  maxOutputTokens,
              }),
            signal:
              AbortSignal.timeout(
                45_000,
              ),
          },
        );
    }
    catch {
      throw new ApiHttpError(
        503,
        "VÉLORA AI no está disponible.",
      );
    }

    if (
      !response.ok
    ) {
      throw new ApiHttpError(
        502,
        "OpenAI no pudo completar el análisis del reporte.",
      );
    }

    let payload:
      unknown;

    try {
      payload =
        await response
          .json();
    }
    catch {
      throw new ApiHttpError(
        502,
        "OpenAI devolvió una respuesta inválida.",
      );
    }

    const text =
      this.responseText(
        payload,
      );

    if (
      !text
    ) {
      throw new ApiHttpError(
        502,
        "OpenAI devolvió una respuesta vacía.",
      );
    }

    try {
      return JSON.parse(
        text,
      ) as unknown;
    }
    catch {
      throw new ApiHttpError(
        502,
        "OpenAI devolvió JSON estructurado inválido.",
      );
    }
  }

  private sanitizeIntent(
    intent:
      ReportAiIntent,
    availableStores:
      ReportStoreOption[],
  ): ReportAiIntent {
    const allowedStoreIds =
      new Set(
        availableStores.map(
          (
            store,
          ) =>
            store.id,
        ),
      );

    const storeId =
      intent.storeId &&
      allowedStoreIds.has(
        intent.storeId,
      )
        ? intent.storeId
        : null;

    if (
      intent.fromDate &&
      intent.toDate &&
      intent.fromDate >
        intent.toDate
    ) {
      throw new ApiHttpError(
        502,
        "OpenAI devolvió un período de reporte inválido.",
      );
    }

    return {
      ...intent,
      storeId,
    };
  }

  private applyDeterministicPeriod(
    question:
      string,
    intent:
      ReportAiIntent,
  ): ReportAiIntent {
    const currentDate =
      this.today();

    const relative =
      this.resolveQuestionPeriod(
        question,
        currentDate,
      );

    if (
      relative
    ) {
      return {
        ...intent,
        fromDate:
          relative.fromDate,
        toDate:
          relative.toDate,
      };
    }

    if (
      intent.fromDate ||
      intent.toDate
    ) {
      return intent;
    }

    const calendar =
      this.resolveSingleMonthYear(
        question,
      );

    if (
      !calendar
    ) {
      return intent;
    }

    return {
      ...intent,
      fromDate:
        calendar.fromDate,
      toDate:
        calendar.toDate,
    };
  }

  private usesSelectedRange(
    question:
      string,
  ): boolean {
    const normalized =
      this.normalizeQuestion(
        question,
      );

    return [
      "periodo seleccionado",
      "rango seleccionado",
      "fechas seleccionadas",
      "estas fechas",
    ].some(
      (
        phrase,
      ) =>
        normalized.includes(
          phrase,
        ),
    );
  }

  private resolveQuestionPeriod(
    question:
      string,
    currentDate:
      string,
  ): {
    fromDate:
      string;
    toDate:
      string;
  } |
  null {
    const normalized =
      this.normalizeQuestion(
        question,
      );

    if (
      normalized.includes(
        "semana pasada",
      )
    ) {
      const currentMonday =
        this.startOfWeek(
          currentDate,
        );
      const from =
        this.shiftDate(
          currentMonday,
          -7,
        );

      return {
        fromDate:
          from,
        toDate:
          this.shiftDate(
            from,
            6,
          ),
      };
    }

    if (
      normalized.includes(
        "ultima semana",
      ) ||
      normalized.includes(
        "ultimos siete dias",
      )
    ) {
      return {
        fromDate:
          this.shiftDate(
            currentDate,
            -6,
          ),
        toDate:
          currentDate,
      };
    }

    if (
      normalized.includes(
        "esta semana",
      )
    ) {
      return {
        fromDate:
          this.startOfWeek(
            currentDate,
          ),
        toDate:
          currentDate,
      };
    }

    const lastDays =
      normalized.match(
        /\bultim(?:o|os|a|as)\s+(\d{1,3})\s+dias\b/,
      );

    if (
      lastDays?.[1]
    ) {
      const days =
        Number(
          lastDays[1],
        );

      if (
        days >=
          1 &&
        days <=
          730
      ) {
        return {
          fromDate:
            this.shiftDate(
              currentDate,
              -(
                days -
                1
              ),
            ),
          toDate:
            currentDate,
        };
      }
    }

    if (
      normalized.includes(
        "ayer",
      )
    ) {
      const yesterday =
        this.shiftDate(
          currentDate,
          -1,
        );

      return {
        fromDate:
          yesterday,
        toDate:
          yesterday,
      };
    }

    if (
      (
        ` ${normalized} `
      ).includes(
        " hoy ",
      )
    ) {
      return {
        fromDate:
          currentDate,
        toDate:
          currentDate,
      };
    }

    if (
      normalized.includes(
        "mes pasado",
      ) ||
      normalized.includes(
        "mes anterior",
      )
    ) {
      const previous =
        this.shiftMonth(
          `${currentDate.slice(0, 7)}-01`,
          -1,
        );

      return {
        fromDate:
          previous,
        toDate:
          this.monthEnd(
            previous,
          ),
      };
    }

    if (
      normalized.includes(
        "este mes",
      ) ||
      normalized.includes(
        "mes actual",
      )
    ) {
      return {
        fromDate:
          `${currentDate.slice(0, 7)}-01`,
        toDate:
          currentDate,
      };
    }

    return null;
  }

  private resolveSingleMonthYear(
    question:
      string,
  ): {
    fromDate:
      string;
    toDate:
      string;
  } |
  null {
    const normalized =
      this.normalizeQuestion(
        question,
      );

    const matches =
      [
        ...normalized.matchAll(
          /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(20\d{2})\b/g,
        ),
      ];

    if (
      matches.length !==
      1
    ) {
      return null;
    }

    const monthName =
      matches[0]?.[1];
    const year =
      matches[0]?.[2];

    if (
      !monthName ||
      !year
    ) {
      return null;
    }

    const months:
      Record<
        string,
        number
      > = {
        enero:
          1,
        febrero:
          2,
        marzo:
          3,
        abril:
          4,
        mayo:
          5,
        junio:
          6,
        julio:
          7,
        agosto:
          8,
        septiembre:
          9,
        octubre:
          10,
        noviembre:
          11,
        diciembre:
          12,
      };

    const month =
      months[
        monthName
      ];

    if (
      !month
    ) {
      return null;
    }

    const fromDate =
      `${year}-${String(month).padStart(2, "0")}-01`;

    return {
      fromDate,
      toDate:
        this.monthEnd(
          fromDate,
        ),
    };
  }

  private normalizeQuestion(
    value:
      string,
  ): string {
    return value
      .normalize(
        "NFD",
      )
      .replace(
        /\p{M}+/gu,
        "",
      )
      .toLowerCase()
      .replace(
        /[^a-z0-9\s]/g,
        " ",
      )
      .replace(
        /\s+/g,
        " ",
      )
      .trim();
  }

  private today():
    string {
    const parts =
      new Intl.DateTimeFormat(
        "en-CA",
        {
          timeZone:
            REPORT_ZONE,
          year:
            "numeric",
          month:
            "2-digit",
          day:
            "2-digit",
        },
      ).formatToParts(
        new Date(),
      );

    const part = (
      type:
        string,
    ) =>
      parts.find(
        (
          item,
        ) =>
          item.type ===
          type,
      )?.value ??
      "";

    return `${part("year")}-${part("month")}-${part("day")}`;
  }

  private shiftDate(
    value:
      string,
    days:
      number,
  ): string {
    const date =
      new Date(
        `${value}T00:00:00Z`,
      );

    date.setUTCDate(
      date.getUTCDate() +
      days,
    );

    return date
      .toISOString()
      .slice(
        0,
        10,
      );
  }

  private shiftMonth(
    value:
      string,
    months:
      number,
  ): string {
    const date =
      new Date(
        `${value}T00:00:00Z`,
      );

    date.setUTCMonth(
      date.getUTCMonth() +
      months,
      1,
    );

    return date
      .toISOString()
      .slice(
        0,
        10,
      );
  }

  private monthEnd(
    firstDay:
      string,
  ): string {
    const next =
      this.shiftMonth(
        firstDay,
        1,
      );

    return this.shiftDate(
      next,
      -1,
    );
  }

  private startOfWeek(
    value:
      string,
  ): string {
    const date =
      new Date(
        `${value}T00:00:00Z`,
      );
    const day =
      date.getUTCDay();
    const mondayOffset =
      day ===
      0
        ? -6
        : 1 -
          day;

    return this.shiftDate(
      value,
      mondayOffset,
    );
  }

  private requireConfigured():
    void {
    this.apiKey();
  }

  private apiKey():
    string {
    const apiKey =
      this.config.value
        .OPENAI_API_KEY
        ?.trim();

    if (
      !apiKey
    ) {
      throw new ApiHttpError(
        503,
        "VÉLORA AI no está configurado.",
      );
    }

    return apiKey;
  }

  private openAiBaseUrl():
    string {
    return this.config.value
      .VELORA_OPENAI_BASE_URL
      .replace(
        /\/$/,
        "",
      );
  }

  private responseText(
    payload:
      unknown,
  ): string |
  null {
    const record =
      this.asRecord(
        payload,
      );

    if (
      typeof record.output_text ===
        "string" &&
      record.output_text
        .trim() !==
        ""
    ) {
      return record.output_text;
    }

    if (
      !Array.isArray(
        record.output,
      )
    ) {
      return null;
    }

    for (
      const item of
      record.output
    ) {
      const output =
        this.asRecord(
          item,
        );

      if (
        !Array.isArray(
          output.content,
        )
      ) {
        continue;
      }

      for (
        const contentItem of
        output.content
      ) {
        const content =
          this.asRecord(
            contentItem,
          );

        if (
          content.type ===
            "output_text" &&
          typeof content.text ===
            "string" &&
          content.text
            .trim() !==
            ""
        ) {
          return content.text;
        }
      }
    }

    return null;
  }

  private asRecord(
    value:
      unknown,
  ): Record<
    string,
    unknown
  > {
    if (
      typeof value ===
        "object" &&
      value !==
        null &&
      !Array.isArray(
        value,
      )
    ) {
      return value as Record<
        string,
        unknown
      >;
    }

    return {};
  }
}
