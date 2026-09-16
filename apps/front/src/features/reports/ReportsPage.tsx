import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  useMutation,
  useQuery,
} from "@tanstack/react-query";

import type {
  ReportOverview,
} from "@velora/contracts";

import {
  veloraApi,
} from "../../core/api/veloraApi";

import {
  useAuthStore,
} from "../../core/auth/authStore";

import {
  useCompanyStore,
} from "../../core/company/companyStore";

import {
  Notice,
} from "../../shared/feedback/Notice";

import {
  ReportChartCard,
} from "./ReportChartCard";

import {
  reportsApi,
  type ReportRole,
} from "./reportsApi";

import "./reports.css";

type PeriodPreset =
  "7D" |
  "30D" |
  "90D" |
  "180D" |
  "365D" |
  "HISTORICAL" |
  "CUSTOM" |
  "AI";

type VoiceState =
  "IDLE" |
  "RECORDING" |
  "TRANSCRIBING" |
  "ERROR";

function shiftDate(
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

function formatMetric(
  value:
    number,
  format:
    "CURRENCY" |
    "COUNT",
): string {
  if (
    format ===
    "CURRENCY"
  ) {
    return `Bs ${value.toLocaleString(
      "es-BO",
      {
        minimumFractionDigits:
          2,
        maximumFractionDigits:
          2,
      },
    )}`;
  }

  return value.toLocaleString(
    "es-BO",
    {
      maximumFractionDigits:
        0,
    },
  );
}

function preferredAudioType():
  string {
  if (
    typeof MediaRecorder ===
    "undefined"
  ) {
    return "";
  }

  return [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ].find(
    (
      type,
    ) =>
      MediaRecorder.isTypeSupported(
        type,
      ),
  ) ??
  "";
}

export function ReportsPage() {
  const user =
    useAuthStore(
      (
        state,
      ) =>
        state.user,
    );

  const companyId =
    useCompanyStore(
      (
        state,
      ) =>
        state.adminCompanyId,
    );

  const role:
    ReportRole =
    user?.role ===
    "STORE_MANAGER"
      ? "STORE_MANAGER"
      : "ADMIN";

  const [
    selectedStoreId,
    setSelectedStoreId,
  ] =
    useState(
      "",
    );

  const [
    fromDate,
    setFromDate,
  ] =
    useState(
      "",
    );

  const [
    toDate,
    setToDate,
  ] =
    useState(
      "",
    );

  const [
    preset,
    setPreset,
  ] =
    useState<
      PeriodPreset
    >(
      "30D",
    );

  const [
    question,
    setQuestion,
  ] =
    useState(
      "Muéstrame un resumen general de los últimos 30 días.",
    );

  const [
    aiReport,
    setAiReport,
  ] =
    useState<
      ReportOverview |
      null
    >(
      null,
    );

  const [
    voiceState,
    setVoiceState,
  ] =
    useState<
      VoiceState
    >(
      "IDLE",
    );

  const [
    voiceSeconds,
    setVoiceSeconds,
  ] =
    useState(
      0,
    );

  const [
    voiceError,
    setVoiceError,
  ] =
    useState<
      string |
      null
    >(
      null,
    );

  const recorderRef =
    useRef<
      MediaRecorder |
      null
    >(
      null,
    );

  const streamRef =
    useRef<
      MediaStream |
      null
    >(
      null,
    );

  const chunksRef =
    useRef<
      Blob[]
    >(
      [],
    );

  const timerRef =
    useRef<
      ReturnType<
        typeof setInterval
      > |
      null
    >(
      null,
    );

  const elapsedRef =
    useRef(
      0,
    );

  const adminStores =
    useQuery({
      queryKey: [
        "report-stores",
        companyId,
      ],
      queryFn:
        () =>
          veloraApi
            .adminStores(
              companyId!,
            ),
      enabled:
        role ===
          "ADMIN" &&
        Boolean(
          companyId,
        ),
    });

  const effectiveStoreId =
    role ===
      "ADMIN" &&
    selectedStoreId &&
    adminStores.data
      ?.some(
        (
          store,
        ) =>
          store.id ===
          selectedStoreId,
      )
      ? selectedStoreId
      : "";

  const reportsEnabled =
    role ===
      "STORE_MANAGER" ||
    Boolean(
      companyId,
    );

  const bounds =
    useQuery({
      queryKey: [
        "report-bounds",
        role,
        companyId,
        effectiveStoreId,
      ],
      queryFn:
        () =>
          reportsApi
            .periodBounds(
              role,
              companyId,
              effectiveStoreId ||
                null,
            ),
      enabled:
        reportsEnabled,
    });

  const overview =
    useQuery({
      queryKey: [
        "report-overview",
        role,
        companyId,
        effectiveStoreId,
        fromDate,
        toDate,
      ],
      queryFn:
        () =>
          reportsApi
            .overview(
              role,
              {
                companyId,
                storeId:
                  effectiveStoreId ||
                  null,
                from:
                  fromDate ||
                  null,
                to:
                  toDate ||
                  null,
              },
            ),
      enabled:
        reportsEnabled,
    });

  const ai =
    useMutation({
      mutationFn:
        async () => {
          if (
            role ===
            "ADMIN"
          ) {
            if (
              !companyId
            ) {
              throw new Error(
                "Seleccione una compañía.",
              );
            }

            return reportsApi
              .aiQuery(
                role,
                {
                  companyId,
                  question,
                  fromDate:
                    fromDate ||
                    null,
                  toDate:
                    toDate ||
                    null,
                },
              );
          }

          return reportsApi
            .aiQuery(
              role,
              {
                question,
                fromDate:
                  fromDate ||
                  null,
                toDate:
                  toDate ||
                  null,
              },
            );
        },
      onSuccess:
        (
          response,
        ) => {
          setPreset(
            "AI",
          );
          setAiReport(
            response.report,
          );
          setFromDate(
            response.intent
              .fromDate ??
              response.report
                .from,
          );
          setToDate(
            response.intent
              .toDate ??
              response.report
                .to,
          );
        },
    });

  const transcription =
    useMutation({
      mutationFn:
        (
          audio:
            Blob,
        ) =>
          reportsApi
            .transcribeVoice(
              role,
              companyId,
              audio,
            ),
      onSuccess:
        (
          response,
        ) => {
          setQuestion(
            response.text,
          );
          setVoiceState(
            "IDLE",
          );
          setVoiceError(
            null,
          );
        },
      onError:
        (
          error,
        ) => {
          setVoiceState(
            "ERROR",
          );
          setVoiceError(
            error instanceof Error
              ? error.message
              : "No fue posible transcribir la consulta por voz.",
          );
        },
    });

  useEffect(
    () => () => {
      if (
        timerRef.current
      ) {
        clearInterval(
          timerRef.current,
        );
      }

      for (
        const track of
        streamRef.current
          ?.getTracks() ??
        []
      ) {
        track.stop();
      }
    },
    [],
  );

  const display =
    aiReport ??
    overview.data;

  const applyPreset = (
    next:
      PeriodPreset,
  ) => {
    const maxDate =
      bounds.data
        ?.maxDate ??
      display?.to;

    if (
      !maxDate
    ) {
      return;
    }

    let nextFrom =
      maxDate;

    switch (
      next
    ) {
      case "7D":
        nextFrom =
          shiftDate(
            maxDate,
            -6,
          );
        break;
      case "30D":
        nextFrom =
          shiftDate(
            maxDate,
            -29,
          );
        break;
      case "90D":
        nextFrom =
          shiftDate(
            maxDate,
            -89,
          );
        break;
      case "180D":
        nextFrom =
          shiftDate(
            maxDate,
            -179,
          );
        break;
      case "365D":
        nextFrom =
          shiftDate(
            maxDate,
            -364,
          );
        break;
      case "HISTORICAL":
        nextFrom =
          bounds.data
            ?.minDate ??
          shiftDate(
            maxDate,
            -29,
          );
        break;
      default:
        setPreset(
          next,
        );
        return;
    }

    setPreset(
      next,
    );
    setAiReport(
      null,
    );
    setFromDate(
      nextFrom,
    );
    setToDate(
      maxDate,
    );
  };

  const submitCustom = (
    event:
      FormEvent,
  ) => {
    event.preventDefault();
    setPreset(
      "CUSTOM",
    );
    setAiReport(
      null,
    );
  };

  const cleanupVoice = () => {
    if (
      timerRef.current
    ) {
      clearInterval(
        timerRef.current,
      );
      timerRef.current =
        null;
    }

    for (
      const track of
      streamRef.current
        ?.getTracks() ??
      []
    ) {
      track.stop();
    }

    streamRef.current =
      null;
    recorderRef.current =
      null;
  };

  const stopRecording = () => {
    const recorder =
      recorderRef.current;

    if (
      !recorder ||
      recorder.state ===
      "inactive"
    ) {
      return;
    }

    recorder.stop();
  };

  const startRecording =
    async () => {
      setVoiceError(
        null,
      );

      if (
        !navigator.mediaDevices
          ?.getUserMedia ||
        typeof MediaRecorder ===
          "undefined"
      ) {
        setVoiceState(
          "ERROR",
        );
        setVoiceError(
          "Este navegador no permite grabar audio para el dictado.",
        );
        return;
      }

      try {
        const stream =
          await navigator.mediaDevices
            .getUserMedia({
              audio: {
                echoCancellation:
                  true,
                noiseSuppression:
                  true,
                autoGainControl:
                  true,
              },
            });

        const mimeType =
          preferredAudioType();

        const recorder =
          mimeType
            ? new MediaRecorder(
                stream,
                {
                  mimeType,
                },
              )
            : new MediaRecorder(
                stream,
              );

        streamRef.current =
          stream;
        recorderRef.current =
          recorder;
        chunksRef.current =
          [];
        elapsedRef.current =
          0;
        setVoiceSeconds(
          0,
        );

        recorder.ondataavailable =
          (
            event,
          ) => {
            if (
              event.data.size >
              0
            ) {
              chunksRef.current
                .push(
                  event.data,
                );
            }
          };

        recorder.onerror =
          () => {
            cleanupVoice();
            setVoiceState(
              "ERROR",
            );
            setVoiceError(
              "La grabación se interrumpió. Puede conservar y editar la consulta escrita.",
            );
          };

        recorder.onstop =
          () => {
            const chunks =
              [
                ...chunksRef.current,
              ];

            const finalType =
              recorder.mimeType ||
              chunks[0]
                ?.type ||
              "audio/webm";

            cleanupVoice();

            if (
              chunks.length ===
              0
            ) {
              setVoiceState(
                "ERROR",
              );
              setVoiceError(
                "No se detectó audio.",
              );
              return;
            }

            const audio =
              new Blob(
                chunks,
                {
                  type:
                    finalType,
                },
              );

            if (
              audio.size ===
              0
            ) {
              setVoiceState(
                "ERROR",
              );
              setVoiceError(
                "La grabación quedó vacía.",
              );
              return;
            }

            setVoiceState(
              "TRANSCRIBING",
            );
            transcription
              .mutate(
                audio,
              );
          };

        recorder.start();
        setVoiceState(
          "RECORDING",
        );

        timerRef.current =
          setInterval(
            () => {
              elapsedRef.current +=
                1;

              setVoiceSeconds(
                elapsedRef.current,
              );

              if (
                elapsedRef.current >=
                60
              ) {
                const active =
                  recorderRef.current;

                if (
                  active &&
                  active.state !==
                    "inactive"
                ) {
                  active.stop();
                }
              }
            },
            1000,
          );
      }
      catch (
        error
      ) {
        cleanupVoice();
        setVoiceState(
          "ERROR",
        );

        if (
          error instanceof
            DOMException &&
          (
            error.name ===
              "NotAllowedError" ||
            error.name ===
              "SecurityError"
          )
        ) {
          setVoiceError(
            "Permiso de micrófono denegado.",
          );
          return;
        }

        if (
          error instanceof
            DOMException &&
          error.name ===
            "NotFoundError"
        ) {
          setVoiceError(
            "No se encontró un micrófono disponible.",
          );
          return;
        }

        setVoiceError(
          "No fue posible iniciar el micrófono.",
        );
      }
    };

  if (
    role ===
      "ADMIN" &&
    !companyId
  ) {
    return (
      <section className="page">
        <div className="page-heading">
          <span className="eyebrow">
            REPORTES
          </span>
          <h1>
            Inteligencia operativa
          </h1>
          <p>
            KPIs, tendencias, inventario e IA con alcance explícito por compañía.
          </p>
        </div>
        <Notice>
          Seleccione una compañía en el menú lateral. No se elegirá ninguna automáticamente.
        </Notice>
      </section>
    );
  }

  return (
    <section className="page reports-page">
      <div className="page-heading report-heading">
        <div>
          <span className="eyebrow">
            {role ===
            "ADMIN"
              ? "REPORTES ADMINISTRATIVOS"
              : "REPORTES DE SUCURSAL"}
          </span>
          <h1>
            Inteligencia operativa
          </h1>
          <p>
            Datos calculados por el backend. La IA interpreta y explica, pero no inventa KPIs.
          </p>
        </div>
        <button
          className="button"
          type="button"
          onClick={
            () => {
              setAiReport(
                null,
              );
              void overview
                .refetch();
            }
          }
          disabled={
            overview.isFetching
          }
        >
          Actualizar
        </button>
      </div>

      {role ===
      "ADMIN" ? (
        <div className="panel report-scope-panel">
          <label>
            Sucursal
            <select
              value={
                effectiveStoreId
              }
              onChange={
                (
                  event,
                ) => {
                  setSelectedStoreId(
                    event.target
                      .value,
                  );
                  setAiReport(
                    null,
                  );
                }
              }
            >
              <option value="">
                Todas las sucursales
              </option>
              {adminStores.data
                ?.filter(
                  (
                    store,
                  ) =>
                    store.active,
                )
                .map(
                  (
                    store,
                  ) => (
                    <option
                      key={
                        store.id
                      }
                      value={
                        store.id
                      }
                    >
                      {store.name}
                    </option>
                  ),
                )}
            </select>
          </label>
        </div>
      ) : null}

      <div className="period-presets">
        {(
          [
            "7D",
            "30D",
            "90D",
            "180D",
            "365D",
            "HISTORICAL",
          ] as const
        ).map(
          (
            item,
          ) => (
            <button
              key={item}
              type="button"
              className={
                preset ===
                item
                  ? "chip active"
                  : "chip"
              }
              onClick={
                () =>
                  applyPreset(
                    item,
                  )
              }
            >
              {item ===
              "HISTORICAL"
                ? "Histórico"
                : item}
            </button>
          ),
        )}
      </div>

      <form
        className="panel report-date-form"
        onSubmit={
          submitCustom
        }
      >
        <label>
          Desde
          <input
            type="date"
            value={
              fromDate ||
              display?.from ||
              ""
            }
            min={
              bounds.data
                ?.minDate
            }
            max={
              bounds.data
                ?.maxDate
            }
            onChange={
              (
                event,
              ) => {
                setFromDate(
                  event.target
                    .value,
                );
                setAiReport(
                  null,
                );
              }
            }
          />
        </label>
        <label>
          Hasta
          <input
            type="date"
            value={
              toDate ||
              display?.to ||
              ""
            }
            min={
              bounds.data
                ?.minDate
            }
            max={
              bounds.data
                ?.maxDate
            }
            onChange={
              (
                event,
              ) => {
                setToDate(
                  event.target
                    .value,
                );
                setAiReport(
                  null,
                );
              }
            }
          />
        </label>
        <button
          className="button"
          type="submit"
        >
          Aplicar rango
        </button>
      </form>

      {overview.error instanceof
      Error ? (
        <Notice kind="error">
          {overview.error
            .message}
        </Notice>
      ) : null}

      {display ? (
        <>
          <div className="report-meta">
            <strong>
              {display.scopeLabel}
            </strong>
            <span>
              {display.from} →{" "}
              {display.to}
            </span>
          </div>

          <div className="report-kpi-grid">
            {display.kpis.map(
              (
                kpi,
              ) => (
                <article
                  key={
                    kpi.key
                  }
                  className="report-kpi"
                >
                  <span>
                    {kpi.label}
                  </span>
                  <strong>
                    {formatMetric(
                      kpi.value,
                      kpi.format,
                    )}
                  </strong>
                  <small>
                    {kpi.helper}
                  </small>
                </article>
              ),
            )}
          </div>

          <div className="report-charts-grid">
            {display.charts.map(
              (
                chart,
              ) => (
                <ReportChartCard
                  key={
                    chart.id
                  }
                  chart={
                    chart
                  }
                />
              ),
            )}
          </div>

          {display.tables.map(
            (
              table,
            ) => (
              <article
                className="panel"
                key={
                  table.id
                }
              >
                <h2>
                  {table.title}
                </h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {table.columns.map(
                          (
                            column,
                          ) => (
                            <th
                              key={
                                column
                              }
                            >
                              {column}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.length ===
                      0 ? (
                        <tr>
                          <td
                            colSpan={
                              table.columns
                                .length
                            }
                          >
                            Sin resultados en el período.
                          </td>
                        </tr>
                      ) : (
                        table.rows.map(
                          (
                            row,
                            rowIndex,
                          ) => (
                            <tr
                              key={`${table.id}-${rowIndex}`}
                            >
                              {row.map(
                                (
                                  cell,
                                  cellIndex,
                                ) => (
                                  <td
                                    key={`${rowIndex}-${cellIndex}`}
                                  >
                                    {cell}
                                  </td>
                                ),
                              )}
                            </tr>
                          ),
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            ),
          )}

          <article className="panel report-insights">
            <h2>
              Hallazgos determinísticos
            </h2>
            <ul>
              {display.deterministicInsights.map(
                (
                  insight,
                ) => (
                  <li
                    key={
                      insight
                    }
                  >
                    {insight}
                  </li>
                ),
              )}
            </ul>
          </article>
        </>
      ) : (
        <div className="panel">
          {overview.isLoading
            ? "Calculando reporte…"
            : "No hay reporte disponible."}
        </div>
      )}

      <article className="panel report-ai-panel">
        <div className="report-ai-title">
          <div>
            <span className="eyebrow">
              VÉLORA AI
            </span>
            <h2>
              Consultar el reporte
            </h2>
          </div>
          <span className={`voice-state ${voiceState.toLowerCase()}`}>
            {voiceState ===
            "RECORDING"
              ? `Micrófono activo · ${voiceSeconds}s`
              : voiceState ===
                  "TRANSCRIBING"
                ? "Transcribiendo…"
                : "Dictado listo"}
          </span>
        </div>

        <label>
          Consulta
          <textarea
            value={
              question
            }
            maxLength={
              800
            }
            rows={
              4
            }
            onChange={
              (
                event,
              ) =>
                setQuestion(
                  event.target
                    .value,
                )
            }
          />
        </label>

        <div className="report-ai-actions">
          <button
            className="button"
            type="button"
            disabled={
              voiceState ===
                "TRANSCRIBING" ||
              transcription.isPending
            }
            onClick={
              () => {
                if (
                  voiceState ===
                  "RECORDING"
                ) {
                  stopRecording();
                }
                else {
                  void startRecording();
                }
              }
            }
          >
            {voiceState ===
            "RECORDING"
              ? "Detener"
              : "Dictar"}
          </button>

          <button
            className="button primary"
            type="button"
            disabled={
              ai.isPending ||
              question.trim()
                .length <
                2 ||
              voiceState ===
                "RECORDING" ||
              voiceState ===
                "TRANSCRIBING"
            }
            onClick={
              () =>
                ai.mutate()
            }
          >
            {ai.isPending
              ? "Generando…"
              : "Generar con IA"}
          </button>
        </div>

        {voiceError ? (
          <Notice kind="error">
            {voiceError}
          </Notice>
        ) : null}

        {ai.error instanceof
        Error ? (
          <Notice kind="error">
            {ai.error.message}
          </Notice>
        ) : null}

        {ai.data ? (
          <div className="ai-narrative">
            <h3>
              Resumen
            </h3>
            <p>
              {ai.data
                .narrative
                .summary}
            </p>

            {ai.data
              .narrative
              .insights
              .length >
            0 ? (
              <>
                <h3>
                  Insights
                </h3>
                <ul>
                  {ai.data
                    .narrative
                    .insights
                    .map(
                      (
                        insight,
                      ) => (
                        <li
                          key={
                            insight
                          }
                        >
                          {insight}
                        </li>
                      ),
                    )}
                </ul>
              </>
            ) : null}

            <h3>
              Evaluación
            </h3>
            <p>
              {ai.data
                .narrative
                .assessment}
            </p>

            {ai.data
              .narrative
              .recommendations
              .length >
            0 ? (
              <>
                <h3>
                  Recomendaciones
                </h3>
                <ul>
                  {ai.data
                    .narrative
                    .recommendations
                    .map(
                      (
                        recommendation,
                      ) => (
                        <li
                          key={
                            recommendation
                          }
                        >
                          {recommendation}
                        </li>
                      ),
                    )}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}
      </article>
    </section>
  );
}
