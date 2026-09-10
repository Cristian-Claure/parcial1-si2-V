import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";

import {
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  TryOnJobResponse,
} from "@velora/contracts";

import {
  apiBlobRequest,
  apiRequest,
} from "../../core/api/apiClient";

import {
  veloraApi,
} from "../../core/api/veloraApi";

import {
  useCompanyStore,
} from "../../core/company/companyStore";

import {
  ProductAssistantPanel,
} from "../ai/ProductAssistantPanel";

import {
  Notice,
} from "../../shared/feedback/Notice";

const terminal =
  (
    status:
      TryOnJobResponse["status"],
  ) =>
    status === "SUCCEEDED" ||
    status === "FAILED" ||
    status === "CANCELLED";

export function TryOnPage() {
  const companyId =
    useCompanyStore(
      (
        state,
      ) =>
        state.storefrontCompanyId,
    );

  const queryClient =
    useQueryClient();

  const productsQuery =
    useQuery({
      queryKey: [
        "public-products",
        companyId,
      ],
      queryFn:
        () =>
          veloraApi
            .publicProducts(
              companyId!,
            ),
      enabled:
        Boolean(
          companyId,
        ),
    });

  const historyQuery =
    useQuery({
      queryKey: [
        "try-on-history",
      ],
      queryFn:
        () =>
          apiRequest<
            TryOnJobResponse[]
          >(
            "/api/customer/try-on/jobs",
          ),
    });

  const readyProducts =
    useMemo(
      () =>
        (
          productsQuery.data ??
          []
        ).filter(
          (product) =>
            product.tryOnReady,
        ),
      [
        productsQuery.data,
      ],
    );

  const [
    selectedProductId,
    setSelectedProductId,
  ] =
    useState(
      "",
    );

  const [
    selectedVariantId,
    setSelectedVariantId,
  ] =
    useState(
      "",
    );

  const [
    personFile,
    setPersonFile,
  ] =
    useState<
      File | null
    >(
      null,
    );

  const [
    personPreview,
    setPersonPreview,
  ] =
    useState<
      string | null
    >(
      null,
    );

  const [
    job,
    setJob,
  ] =
    useState<
      TryOnJobResponse | null
    >(
      null,
    );

  const [
    resultUrl,
    setResultUrl,
  ] =
    useState<
      string | null
    >(
      null,
    );

  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
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

  const selectedProduct =
    readyProducts.find(
      (product) =>
        product.id ===
        selectedProductId,
    ) ??
    readyProducts[0] ??
    null;

  const activeVariants =
    selectedProduct
      ?.variants
      .filter(
        (variant) =>
          variant.active,
      ) ??
    [];

  const selectedVariant =
    activeVariants.find(
      (variant) =>
        variant.id ===
        selectedVariantId,
    ) ??
    activeVariants[0] ??
    null;

  useEffect(
    () => {
      return () => {
        if (
          personPreview
        ) {
          URL.revokeObjectURL(
            personPreview,
          );
        }
      };
    },
    [
      personPreview,
    ],
  );

  useEffect(
    () => {
      if (
        !job ||
        terminal(
          job.status,
        )
      ) {
        return;
      }

      let cancelled =
        false;

      const interval =
        window.setInterval(
          () => {
            void apiRequest<
              TryOnJobResponse
            >(
              `/api/customer/try-on/jobs/${job.id}`,
            )
              .then(
                (
                  current,
                ) => {
                  if (
                    !cancelled
                  ) {
                    setJob(
                      current,
                    );
                  }
                },
              )
              .catch(
                (
                  cause:
                    unknown,
                ) => {
                  if (
                    !cancelled
                  ) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "No se pudo actualizar el estado del probador.",
                    );
                  }
                },
              );
          },
          1500,
        );

      return () => {
        cancelled =
          true;
        window.clearInterval(
          interval,
        );
      };
    },
    [
      job,
    ],
  );

  useEffect(
    () => {
      if (
        job?.status !==
          "SUCCEEDED" ||
        !job.resultUrl
      ) {
        return;
      }

      let active =
        true;
      let objectUrl:
        string | null =
          null;

      void apiBlobRequest(
        job.resultUrl,
      )
        .then(
          (
            blob,
          ) => {
            if (
              !active
            ) {
              return;
            }

            objectUrl =
              URL.createObjectURL(
                blob,
              );
            setResultUrl(
              objectUrl,
            );
          },
        )
        .catch(
          (
            cause:
              unknown,
          ) => {
            if (
              active
            ) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "No se pudo descargar el resultado.",
              );
            }
          },
        );

      return () => {
        active =
          false;

        if (
          objectUrl
        ) {
          URL.revokeObjectURL(
            objectUrl,
          );
        }
      };
    },
    [
      job?.status,
      job?.resultUrl,
    ],
  );

  const choosePhoto =
    (
      event:
        ChangeEvent<HTMLInputElement>,
    ) => {
      const file =
        event.target.files?.[0] ??
        null;

      setPersonFile(
        file,
      );
      setPersonPreview(
        file
          ? URL.createObjectURL(
              file,
            )
          : null,
      );
      setError(
        null,
      );
    };

  const createJob =
    async () => {
      if (
        !selectedProduct ||
        !personFile
      ) {
        return;
      }

      setBusy(
        true,
      );
      setError(
        null,
      );
      setResultUrl(
        null,
      );

      try {
        const form =
          new FormData();

        form.append(
          "productId",
          selectedProduct.id,
        );

        if (
          selectedVariant
        ) {
          form.append(
            "variantId",
            selectedVariant.id,
          );
        }

        form.append(
          "person",
          personFile,
          personFile.name,
        );

        const created =
          await apiRequest<
            TryOnJobResponse
          >(
            "/api/customer/try-on/jobs",
            {
              method:
                "POST",
              body:
                form,
            },
          );

        setJob(
          created,
        );

        await queryClient
          .invalidateQueries({
            queryKey: [
              "try-on-history",
            ],
          });
      }
      catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "No se pudo iniciar el probador virtual.",
        );
      }
      finally {
        setBusy(
          false,
        );
      }
    };

  const cancelJob =
    async () => {
      if (
        !job
      ) {
        return;
      }

      setBusy(
        true,
      );
      setError(
        null,
      );

      try {
        const cancelled =
          await apiRequest<
            TryOnJobResponse
          >(
            `/api/customer/try-on/jobs/${job.id}`,
            {
              method:
                "DELETE",
            },
          );

        setJob(
          cancelled,
        );

        await queryClient
          .invalidateQueries({
            queryKey: [
              "try-on-history",
            ],
          });
      }
      catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "No se pudo cancelar la generación.",
        );
      }
      finally {
        setBusy(
          false,
        );
      }
    };

  if (
    !companyId
  ) {
    return (
      <section className="page">
        <Notice>
          Seleccione una compañía desde el catálogo antes de usar el probador.
        </Notice>
      </section>
    );
  }

  const products =
    productsQuery.data ??
    [];

  return (
    <section className="page">
      <div className="page-heading">
        <span className="eyebrow">PROBADOR VIRTUAL</span>
        <h1>Pruebe una pieza con su foto</h1>
        <p>
          La foto se envía autenticada al backend. El resultado se sirve desde almacenamiento administrado y no desde la URL del proveedor.
        </p>
      </div>

      {
        error
          ? (
              <Notice kind="error">
                {error}
              </Notice>
            )
          : null
      }

      <div className="two-columns">
        <div className="panel">
          <h2>1. Seleccione la prenda</h2>

          {
            productsQuery.isLoading
              ? <p>Cargando catálogo…</p>
              : null
          }

          {
            !productsQuery.isLoading &&
            readyProducts.length === 0
              ? (
                  <Notice>
                    No hay productos con una prenda TRY_ON_GARMENT administrada.
                  </Notice>
                )
              : (
                  <>
                    <label>
                      Producto
                      <select
                        value={
                          selectedProduct?.id ??
                          ""
                        }
                        onChange={
                          (
                            event,
                          ) => {
                            setSelectedProductId(
                              event.target.value,
                            );
                            setSelectedVariantId(
                              "",
                            );
                          }
                        }
                      >
                        {
                          readyProducts.map(
                            (
                              product,
                            ) => (
                              <option
                                key={product.id}
                                value={product.id}
                              >
                                {product.name}
                              </option>
                            ),
                          )
                        }
                      </select>
                    </label>

                    {
                      activeVariants.length > 0
                        ? (
                            <label>
                              Variante
                              <select
                                value={
                                  selectedVariant?.id ??
                                  ""
                                }
                                onChange={
                                  (
                                    event,
                                  ) =>
                                    setSelectedVariantId(
                                      event.target.value,
                                    )
                                }
                              >
                                {
                                  activeVariants.map(
                                    (
                                      variant,
                                    ) => (
                                      <option
                                        key={variant.id}
                                        value={variant.id}
                                      >
                                        {variant.size} · {variant.color}
                                      </option>
                                    ),
                                  )
                                }
                              </select>
                            </label>
                          )
                        : null
                    }
                  </>
                )
          }

          <h2>2. Seleccione su foto</h2>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={choosePhoto}
          />

          {
            personPreview
              ? (
                  <img
                    src={personPreview}
                    alt="Vista previa de la foto"
                    style={{
                      width:
                        "100%",
                      maxHeight:
                        360,
                      objectFit:
                        "contain",
                    }}
                  />
                )
              : null
          }

          <button
            className="button primary"
            type="button"
            disabled={
              busy ||
              !selectedProduct ||
              !personFile
            }
            onClick={
              () => void createJob()
            }
          >
            {
              busy
                ? "Procesando…"
                : "Generar Try-On"
            }
          </button>
        </div>

        <div className="panel">
          <h2>Resultado</h2>

          {
            job
              ? (
                  <>
                    <p>
                      Estado: <strong>{job.status}</strong>
                    </p>
                    <p>
                      Provider: {job.provider}
                    </p>
                  </>
                )
              : (
                  <Notice>
                    Inicie una generación para ver el resultado.
                  </Notice>
                )
          }

          {
            job &&
            !terminal(
              job.status,
            )
              ? (
                  <button
                    className="button secondary"
                    type="button"
                    disabled={busy}
                    onClick={
                      () => void cancelJob()
                    }
                  >
                    Cancelar generación
                  </button>
                )
              : null
          }

          {
            job?.status ===
              "FAILED"
              ? (
                  <Notice kind="error">
                    {
                      job.errorMessage ??
                      "No se pudo completar el probador virtual."
                    }
                  </Notice>
                )
              : null
          }

          {
            resultUrl
              ? (
                  <img
                    src={resultUrl}
                    alt="Resultado del probador virtual"
                    style={{
                      width:
                        "100%",
                      maxHeight:
                        520,
                      objectFit:
                        "contain",
                    }}
                  />
                )
              : null
          }
        </div>
      </div>

      <div className="panel">
        <h2>Historial reciente</h2>
        {
          historyQuery.data?.length
            ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Provider</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {
                        historyQuery.data.map(
                          (
                            item,
                          ) => (
                            <tr key={item.id}>
                              <td>
                                {
                                  new Date(
                                    item.createdAt,
                                  ).toLocaleString()
                                }
                              </td>
                              <td>{item.provider}</td>
                              <td>{item.status}</td>
                            </tr>
                          ),
                        )
                      }
                    </tbody>
                  </table>
                </div>
              )
            : (
                <Notice>
                  Todavía no hay generaciones registradas.
                </Notice>
              )
        }
      </div>

      <ProductAssistantPanel
        companyId={companyId}
        products={products}
      />
    </section>
  );
}
