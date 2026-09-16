import {
  type FormEvent,
} from "react";

import type {
  ProductResponse,
} from "@velora/contracts";

import {
  Notice,
} from "../../shared/feedback/Notice";

import {
  useProductAssistant,
} from "./useProductAssistant";

export function ProductAssistantPanel({
  companyId,
  products,
}: {
  companyId: string;
  products: ProductResponse[];
}) {
  const {
    message,
    setMessage,
    result,
    error,
    loading,
    submit,
  } =
    useProductAssistant(
      companyId,
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

  const onSubmit =
    (
      event:
        FormEvent<HTMLFormElement>,
    ) => {
      event.preventDefault();

      void submit(
        message.trim(),
      );
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
          onSubmit
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
