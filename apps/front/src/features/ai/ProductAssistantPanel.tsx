import {
  useState,
  type FormEvent,
} from "react";

import type {
  ProductAssistantHistoryItem,
  ProductAssistantResponse,
  ProductResponse,
} from "@velora/contracts";

import {
  apiRequest,
  jsonBody,
} from "../../core/api/apiClient";

import {
  Notice,
} from "../../shared/feedback/Notice";

export function ProductAssistantPanel({
  companyId,
  products,
}: {
  companyId: string;
  products: ProductResponse[];
}) {
  const [
    message,
    setMessage,
  ] =
    useState(
      "",
    );

  const [
    history,
    setHistory,
  ] =
    useState<
      ProductAssistantHistoryItem[]
    >(
      [],
    );

  const [
    result,
    setResult,
  ] =
    useState<
      ProductAssistantResponse | null
    >(
      null,
    );

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(
      null,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      false,
    );

  const productNames =
    new Map(
      products.map(
        (product) => [
          product.id,
          product.name,
        ],
      ),
    );

  const submit =
    async (
      event:
        FormEvent<HTMLFormElement>,
    ) => {
      event.preventDefault();

      const trimmed =
        message.trim();

      if (
        trimmed.length < 2
      ) {
        return;
      }

      setLoading(
        true,
      );
      setError(
        null,
      );

      try {
        const response =
          await apiRequest<
            ProductAssistantResponse
          >(
            "/api/customer/assistant/products",
            {
              method:
                "POST",
              body:
                jsonBody({
                  companyId,
                  message:
                    trimmed,
                  history:
                    history.slice(
                      -8,
                    ),
                }),
            },
          );

        setResult(
          response,
        );
        setHistory(
          (
            current,
          ) => [
            ...current,
            {
              role:
                "user" as const,
              content:
                trimmed,
            },
            {
              role:
                "assistant" as const,
              content:
                response.reply,
            },
          ].slice(
            -8,
          ),
        );
        setMessage(
          "",
        );
      }
      catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "No se pudo consultar el asistente.",
        );
      }
      finally {
        setLoading(
          false,
        );
      }
    };

  return (
    <section className="panel">
      <span className="eyebrow">ASISTENTE IA</span>
      <h2>Encuentre una pieza con ayuda de IA</h2>
      <p>
        La recomendación se limita al catálogo activo de la compañía seleccionada.
      </p>

      <form
        onSubmit={
          (
            event,
          ) => void submit(
            event,
          )
        }
      >
        <label>
          ¿Qué está buscando?
          <textarea
            value={message}
            maxLength={800}
            onChange={
              (
                event,
              ) =>
                setMessage(
                  event.target.value,
                )
            }
            placeholder="Ej.: Busco una opción formal en tonos oscuros."
          />
        </label>
        <button
          className="button secondary"
          disabled={
            loading ||
            message.trim().length < 2
          }
        >
          {
            loading
              ? "Consultando…"
              : "Pedir recomendación"
          }
        </button>
      </form>

      {
        error
          ? (
              <Notice kind="error">
                {error}
              </Notice>
            )
          : null
      }

      {
        result
          ? (
              <div>
                <p>
                  {result.reply}
                </p>
                {
                  result.recommendations.length > 0
                    ? (
                        <ul>
                          {
                            result.recommendations.map(
                              (
                                recommendation,
                              ) => (
                                <li key={recommendation.productId}>
                                  <strong>
                                    {
                                      productNames.get(
                                        recommendation.productId,
                                      ) ??
                                      recommendation.productId
                                    }
                                  </strong>
                                  {" — "}
                                  {recommendation.reason}
                                </li>
                              ),
                            )
                          }
                        </ul>
                      )
                    : (
                        <Notice>
                          No hay una recomendación concreta para esta consulta.
                        </Notice>
                      )
                }
                <small>
                  Modelo: {result.model}
                </small>
              </div>
            )
          : null
      }
    </section>
  );
}
