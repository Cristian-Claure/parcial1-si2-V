import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Image,
  Pressable,
  Text,
  View,
} from "react-native";

import * as ImagePicker from "expo-image-picker";

import {
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ProductAssistantHistoryItem,
  ProductAssistantResponse,
  ProductResponse,
  TryOnJobResponse,
} from "@velora/contracts";

import {
  apiBaseUrl,
  apiRequest,
  jsonBody,
} from "@/core/api/apiClient";

import {
  veloraApi,
} from "@/core/api/veloraApi";

import {
  getAccessToken,
} from "@/core/auth/sessionStore";

import {
  useCompanyStore,
} from "@/core/company/companyStore";

import {
  CompanyGate,
} from "@/features/company/CompanyGate";

import {
  commonStyles,
} from "@/shared/theme";

import {
  Button,
  CustomerShell,
  Field,
  Loading,
  Notice,
} from "@/shared/ui";

const terminal =
  (
    status:
      TryOnJobResponse["status"],
  ) =>
    status === "SUCCEEDED" ||
    status === "FAILED" ||
    status === "CANCELLED";

export default function TryOnScreen() {
  const companyId =
    useCompanyStore(
      (
        state,
      ) =>
        state.selectedCompanyId,
    );

  const queryClient =
    useQueryClient();

  const catalog =
    useQuery({
      queryKey: [
        "mobile-try-on-catalog",
        companyId,
      ],
      enabled:
        Boolean(
          companyId,
        ),
      queryFn:
        () =>
          veloraApi
            .products(
              companyId!,
            ),
    });

  const history =
    useQuery({
      queryKey: [
        "mobile-try-on-history",
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
          catalog.data ??
          []
        ).filter(
          (
            product,
          ) =>
            product.tryOnReady,
        ),
      [
        catalog.data,
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
    photo,
    setPhoto,
  ] =
    useState<
      ImagePicker.ImagePickerAsset | null
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
    resultToken,
    setResultToken,
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

  const [
    assistantMessage,
    setAssistantMessage,
  ] =
    useState(
      "",
    );

  const [
    assistantHistory,
    setAssistantHistory,
  ] =
    useState<
      ProductAssistantHistoryItem[]
    >(
      [],
    );

  const [
    assistantResult,
    setAssistantResult,
  ] =
    useState<
      ProductAssistantResponse | null
    >(
      null,
    );

  const selectedProduct:
    ProductResponse | null =
      readyProducts.find(
        (
          product,
        ) =>
          product.id ===
          selectedProductId,
      ) ??
      readyProducts[0] ??
      null;

  const activeVariants =
    selectedProduct
      ?.variants
      .filter(
        (
          variant,
        ) =>
          variant.active,
      ) ??
    [];

  const selectedVariant =
    activeVariants.find(
      (
        variant,
      ) =>
        variant.id ===
        selectedVariantId,
    ) ??
    activeVariants[0] ??
    null;

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

      const timer =
        setInterval(
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
                        : "No se pudo actualizar el estado.",
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
        clearInterval(
          timer,
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
        "SUCCEEDED"
      ) {
        setResultToken(
          null,
        );

        return;
      }

      let active =
        true;

      void getAccessToken()
        .then(
          (
            token,
          ) => {
            if (
              active
            ) {
              setResultToken(
                token,
              );
            }
          },
        );

      return () => {
        active =
          false;
      };
    },
    [
      job?.status,
    ],
  );

  const pickPhoto =
    async () => {
      const result =
        await ImagePicker
          .launchImageLibraryAsync({
            allowsEditing:
              false,
            quality:
              1,
          });

      if (
        result.canceled
      ) {
        return;
      }

      const selected =
        result.assets[0];

      if (
        selected
      ) {
        setPhoto(
          selected,
        );
        setError(
          null,
        );
      }
    };

  const createTryOn =
    async () => {
      if (
        !selectedProduct ||
        !photo
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

        const filename =
          photo.fileName ??
          `person-${Date.now()}.jpg`;

        form.append(
          "person",
          {
            uri:
              photo.uri,
            name:
              filename,
            type:
              photo.mimeType ??
              "image/jpeg",
          } as unknown as Blob,
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
              "mobile-try-on-history",
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

  const cancelTryOn =
    async () => {
      if (
        !job
      ) {
        return;
      }

      setBusy(
        true,
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
              "mobile-try-on-history",
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

  const askAssistant =
    async () => {
      if (
        !companyId ||
        assistantMessage
          .trim()
          .length < 2
      ) {
        return;
      }

      setBusy(
        true,
      );
      setError(
        null,
      );

      const message =
        assistantMessage
          .trim();

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
                  message,
                  history:
                    assistantHistory.slice(
                      -8,
                    ),
                }),
            },
          );

        setAssistantResult(
          response,
        );
        setAssistantHistory(
          (
            current,
          ) => [
            ...current,
            {
              role:
                "user" as const,
              content:
                message,
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
        setAssistantMessage(
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
        setBusy(
          false,
        );
      }
    };

  const resultSource =
    job?.status ===
      "SUCCEEDED" &&
    job.resultUrl &&
    resultToken
      ? {
          uri:
            `${apiBaseUrl}${job.resultUrl}`,
          headers: {
            Authorization:
              `Bearer ${resultToken}`,
          },
        }
      : null;

  const productNames =
    new Map(
      (
        catalog.data ??
        []
      ).map(
        (
          product,
        ) => [
          product.id,
          product.name,
        ],
      ),
    );

  return (
    <CustomerShell active="tryon">
      <CompanyGate>
        <Text style={commonStyles.eyebrow}>
          PROBADOR VIRTUAL
        </Text>
        <Text style={commonStyles.heading}>
          Pruebe una pieza con su foto.
        </Text>

        {
          catalog.isLoading
            ? <Loading label="Cargando prendas…" />
            : null
        }

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
          !catalog.isLoading &&
          readyProducts.length === 0
            ? (
                <Notice>
                  No hay prendas con TRY_ON_GARMENT administrado.
                </Notice>
              )
            : null
        }

        <View style={{ gap: 8 }}>
          <Text style={commonStyles.label}>
            Producto
          </Text>
          {
            readyProducts.map(
              (
                product,
              ) => (
                <Choice
                  key={product.id}
                  label={product.name}
                  active={
                    selectedProduct?.id ===
                    product.id
                  }
                  onPress={
                    () => {
                      setSelectedProductId(
                        product.id,
                      );
                      setSelectedVariantId(
                        "",
                      );
                    }
                  }
                />
              ),
            )
          }
        </View>

        {
          activeVariants.length > 0
            ? (
                <View style={{ gap: 8 }}>
                  <Text style={commonStyles.label}>
                    Variante
                  </Text>
                  {
                    activeVariants.map(
                      (
                        variant,
                      ) => (
                        <Choice
                          key={variant.id}
                          label={`${variant.size} · ${variant.color}`}
                          active={
                            selectedVariant?.id ===
                            variant.id
                          }
                          onPress={
                            () =>
                              setSelectedVariantId(
                                variant.id,
                              )
                          }
                        />
                      ),
                    )
                  }
                </View>
              )
            : null
        }

        <Button
          title="Elegir foto"
          variant="secondary"
          onPress={
            () => void pickPhoto()
          }
        />

        {
          photo
            ? (
                <Image
                  source={{
                    uri:
                      photo.uri,
                  }}
                  resizeMode="contain"
                  style={{
                    width:
                      "100%",
                    height:
                      320,
                    borderRadius:
                      16,
                  }}
                />
              )
            : null
        }

        <Button
          title={
            busy
              ? "Procesando…"
              : "Generar Try-On"
          }
          disabled={
            busy ||
            !selectedProduct ||
            !photo
          }
          onPress={
            () => void createTryOn()
          }
        />

        {
          job
            ? (
                <View style={commonStyles.card}>
                  <Text style={commonStyles.subheading}>
                    Estado: {job.status}
                  </Text>
                  <Text style={commonStyles.muted}>
                    Provider: {job.provider}
                  </Text>
                  {
                    !terminal(
                      job.status,
                    )
                      ? (
                          <Button
                            title="Cancelar generación"
                            variant="secondary"
                            disabled={busy}
                            onPress={
                              () => void cancelTryOn()
                            }
                          />
                        )
                      : null
                  }
                </View>
              )
            : null
        }

        {
          resultSource
            ? (
                <Image
                  source={resultSource}
                  resizeMode="contain"
                  style={{
                    width:
                      "100%",
                    height:
                      420,
                    borderRadius:
                      16,
                  }}
                />
              )
            : null
        }

        <View style={commonStyles.card}>
          <Text style={commonStyles.subheading}>
            Historial reciente
          </Text>
          {
            history.data?.slice(
              0,
              5,
            ).map(
              (
                item,
              ) => (
                <Text
                  key={item.id}
                  style={commonStyles.muted}
                >
                  {item.provider} · {item.status} · {new Date(item.createdAt).toLocaleString()}
                </Text>
              ),
            )
          }
        </View>

        <View style={commonStyles.card}>
          <Text style={commonStyles.eyebrow}>
            ASISTENTE IA
          </Text>
          <Text style={commonStyles.subheading}>
            ¿Qué prenda está buscando?
          </Text>
          <Field
            label="Consulta"
            value={assistantMessage}
            onChangeText={setAssistantMessage}
            maxLength={800}
            multiline
            placeholder="Ej.: Busco algo formal en tonos oscuros."
          />
          <Button
            title="Pedir recomendación"
            variant="secondary"
            disabled={
              busy ||
              assistantMessage
                .trim()
                .length < 2
            }
            onPress={
              () => void askAssistant()
            }
          />
          {
            assistantResult
              ? (
                  <View style={{ gap: 8 }}>
                    <Text style={commonStyles.body}>
                      {assistantResult.reply}
                    </Text>
                    {
                      assistantResult.recommendations.map(
                        (
                          recommendation,
                        ) => (
                          <Text
                            key={recommendation.productId}
                            style={commonStyles.muted}
                          >
                            {
                              productNames.get(
                                recommendation.productId,
                              ) ??
                              recommendation.productId
                            }
                            {" · "}
                            {recommendation.reason}
                          </Text>
                        ),
                      )
                    }
                  </View>
                )
              : null
          }
        </View>
      </CompanyGate>
    </CustomerShell>
  );
}

function Choice({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        commonStyles.chip,
        active &&
          commonStyles.chipActive,
      ]}
    >
      <Text
        style={[
          commonStyles.chipText,
          active &&
            commonStyles.chipTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
