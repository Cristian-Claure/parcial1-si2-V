import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  CashMovementResponse,
  CashMovementType,
  CashSessionResponse,
  CreatePosSaleRequest,
  PointOfSaleResponse,
  PosPaymentMethod,
  PosSaleResponse,
  VariantResponse,
} from "@velora/contracts";

import {
  ApiClientError,
} from "../../core/api/apiClient";

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
  useOperationalCompanyId,
} from "../../core/company/useOperationalCompany";

import {
  offlineCache,
  type OfflinePosSaleEntry,
  type OfflinePosItemSnapshot,
} from "../../core/offline/offlineDb";

import {
  posPaymentAllowedOffline,
  queuedPosQuantity,
} from "../../core/offline/posOfflineLogic";

import {
  syncOfflinePosSales,
} from "../../core/offline/syncOfflinePosSales";

import {
  ConfirmDialog,
  type ConfirmDialogState,
} from "../../shared/feedback/ConfirmDialog";

import {
  EmptyState,
  Notice,
} from "../../shared/feedback/Notice";

interface PosCatalogItem {
  variant: VariantResponse;
  productName: string;
  categoryName: string;
  availableQuantity: number;
}

interface PosCartLine {
  variantId: string;
  productName: string;
  sku: string;
  size: string;
  color: string;
  unitPrice: number;
  currency: string;
  quantity: number;
}

const money = (
  amount: number,
  currency = "BOB",
) =>
  new Intl.NumberFormat(
    "es-BO",
    {
      style: "currency",
      currency,
    },
  ).format(amount);

const readError = (
  error: unknown,
  fallback: string,
) =>
  error instanceof Error
    ? error.message
    : fallback;

export function PosPage() {
  const user =
    useAuthStore(
      (state) =>
        state.user,
    )!;

  const operationsRole:
    "ADMIN" |
    "STORE_MANAGER" =
    user.role === "ADMIN"
      ? "ADMIN"
      : "STORE_MANAGER";

  const companyId =
    useOperationalCompanyId();

  const adminCompanyId =
    useCompanyStore(
      (state) =>
        state.adminCompanyId,
    );

  const queryClient =
    useQueryClient();

  const [selectedPointId, setSelectedPointId] =
    useState("");

  const [formStoreId, setFormStoreId] =
    useState("");

  const [editingPoint, setEditingPoint] =
    useState<PointOfSaleResponse | null>(
      null,
    );

  const [cart, setCart] =
    useState<PosCartLine[]>([]);

  const [search, setSearch] =
    useState("");

  const [paymentMethod, setPaymentMethod] =
    useState<PosPaymentMethod>(
      "CASH",
    );

  const [message, setMessage] =
    useState<{
      kind:
        "success" |
        "error" |
        "info";
      text: string;
    } | null>(null);

  const [confirm, setConfirm] =
    useState<ConfirmDialogState | null>(
      null,
    );

  const [offlineSales, setOfflineSales] =
    useState<OfflinePosSaleEntry[]>([]);

  const [online, setOnline] =
    useState(
      () => navigator.onLine,
    );

  const refreshOffline =
    useCallback(
      async () => {
        setOfflineSales(
          await offlineCache.posSales(
            user.id,
          ),
        );
      },
      [user.id],
    );

  useOnlineStatus(
    setOnline,
    refreshOffline,
  );

  const points =
    useQuery({
      queryKey: [
        "pos-points",
        operationsRole,
        companyId,
      ],
      queryFn: () =>
        veloraApi.pointsOfSale(
          operationsRole,
          companyId ?? undefined,
        ),
      enabled:
        Boolean(companyId),
    });

  const stores =
    useQuery({
      queryKey: [
        "pos-admin-stores",
        adminCompanyId,
      ],
      queryFn: () =>
        veloraApi.adminStores(
          adminCompanyId!,
        ),
      enabled:
        user.role === "ADMIN" &&
        Boolean(adminCompanyId),
    });

  const warehouses =
    useQuery({
      queryKey: [
        "pos-warehouses",
        operationsRole,
        companyId,
      ],
      queryFn:
        veloraApi.warehouses,
      enabled:
        Boolean(companyId),
    });

  const selectedPoint =
    points.data?.find(
      (point) =>
        point.id ===
        selectedPointId,
    ) ?? null;

  const openSession =
    useQuery({
      queryKey: [
        "pos-open-session",
        operationsRole,
        selectedPointId,
      ],
      queryFn: () =>
        veloraApi.openCashSession(
          operationsRole,
          selectedPointId,
        ),
      enabled:
        Boolean(selectedPointId),
      retry: false,
    });

  const noOpenSession =
    openSession.error instanceof ApiClientError &&
    openSession.error.status === 404;

  const session =
    openSession.data ?? null;

  const movements =
    useQuery({
      queryKey: [
        "pos-movements",
        operationsRole,
        session?.id,
      ],
      queryFn: () =>
        veloraApi.cashMovements(
          operationsRole,
          session!.id,
        ),
      enabled:
        Boolean(session?.id),
    });

  const pendingSales =
    useQuery({
      queryKey: [
        "pos-pending-sales",
        operationsRole,
        session?.id,
      ],
      queryFn: () =>
        veloraApi.pendingPosSales(
          operationsRole,
          session!.id,
        ),
      enabled:
        Boolean(session?.id),
    });

  const products =
    useQuery({
      queryKey: [
        "pos-products",
        companyId,
      ],
      queryFn: () =>
        veloraApi.managedProducts(
          companyId!,
        ),
      enabled:
        Boolean(
          companyId &&
          session?.id,
        ),
    });

  const stock =
    useQuery({
      queryKey: [
        "pos-stock",
        session?.warehouseId,
      ],
      queryFn: () =>
        veloraApi.stock(
          session!.warehouseId,
        ),
      enabled:
        Boolean(
          session?.warehouseId,
        ),
    });

  const localForSession =
    useMemo(
      () =>
        offlineSales.filter(
          (entry) =>
            entry.cashSessionId ===
            session?.id,
        ),
      [
        offlineSales,
        session?.id,
      ],
    );

  const catalog =
    useMemo<PosCatalogItem[]>(
      () => {
        if (!session) {
          return [];
        }

        const stockByVariant =
          new Map(
            (stock.data ?? [])
              .map(
                (item) => [
                  item.variantId,
                  Math.max(
                    0,
                    item.availableQuantity -
                    queuedPosQuantity(
                      offlineSales,
                      session.warehouseId,
                      item.variantId,
                    ),
                  ),
                ] as const,
              ),
          );

        const query =
          search
            .trim()
            .toLocaleLowerCase(
              "es",
            );

        return (
          products.data ?? []
        )
          .filter(
            (product) =>
              product.status ===
              "ACTIVE",
          )
          .flatMap(
            (product) =>
              product.variants
                .filter(
                  (variant) =>
                    variant.active,
                )
                .map(
                  (variant) => ({
                    variant,
                    productName:
                      product.name,
                    categoryName:
                      product.categoryName,
                    availableQuantity:
                      stockByVariant.get(
                        variant.id,
                      ) ?? 0,
                  })),
          )
          .filter(
            (item) => {
              if (!query) {
                return true;
              }

              return [
                item.productName,
                item.categoryName,
                item.variant.sku,
                item.variant.color,
                item.variant.size,
              ]
                .join(" ")
                .toLocaleLowerCase(
                  "es",
                )
                .includes(query);
            },
          )
          .sort(
            (
              left,
              right,
            ) =>
              left.productName
                .localeCompare(
                  right.productName,
                  "es",
                ) ||
              left.variant.sku
                .localeCompare(
                  right.variant.sku,
                  "es",
                ),
          );
      },
      [
        offlineSales,
        products.data,
        search,
        session,
        stock.data,
      ],
    );

  const total =
    useMemo(
      () =>
        Number(
          cart.reduce(
            (
              sum,
              line,
            ) =>
              sum +
              line.unitPrice *
              line.quantity,
            0,
          ).toFixed(2),
        ),
      [cart],
    );

  const createPoint =
    useMutation({
      mutationFn:
        veloraApi.createPointOfSale,
      onSuccess:
        async () => {
          setEditingPoint(null);
          setFormStoreId("");
          setMessage({
            kind: "success",
            text:
              "Punto de venta creado correctamente.",
          });
          await queryClient.invalidateQueries({
            queryKey: [
              "pos-points",
            ],
          });
        },
      onError:
        (error) =>
          setMessage({
            kind: "error",
            text:
              readError(
                error,
                "No se pudo crear el punto de venta.",
              ),
          }),
    });

  const updatePoint =
    useMutation({
      mutationFn:
        ({
          id,
          body,
        }: {
          id: string;
          body: {
            warehouseId: string;
            code: string;
            name: string;
            active: boolean;
          };
        }) =>
          veloraApi.updatePointOfSale(
            id,
            body,
          ),
      onSuccess:
        async () => {
          setEditingPoint(null);
          setFormStoreId("");
          setMessage({
            kind: "success",
            text:
              "Punto de venta actualizado.",
          });
          await queryClient.invalidateQueries({
            queryKey: [
              "pos-points",
            ],
          });
        },
      onError:
        (error) =>
          setMessage({
            kind: "error",
            text:
              readError(
                error,
                "No se pudo actualizar el punto de venta.",
              ),
          }),
    });

  const open =
    useMutation({
      mutationFn:
        (
          body: {
            pointOfSaleId: string;
            openingAmount: number;
            openingNotes: string | null;
          },
        ) =>
          veloraApi.openCash(
            operationsRole,
            body,
          ),
      onSuccess:
        async (created) => {
          setMessage({
            kind: "success",
            text:
              `Caja ${created.sessionNumber} abierta.`,
          });
          setCart([]);
          await invalidateSession(
            queryClient,
          );
        },
      onError:
        (error) =>
          setMessage({
            kind: "error",
            text:
              readError(
                error,
                "No se pudo abrir la caja.",
              ),
          }),
    });

  const movement =
    useMutation({
      mutationFn:
        (
          input: {
            movementType: CashMovementType;
            amount: number;
            reason: string;
          },
        ) =>
          veloraApi.registerCashMovement(
            operationsRole,
            session!.id,
            input,
          ),
      onSuccess:
        async () => {
          setMessage({
            kind: "success",
            text:
              "Movimiento de caja registrado.",
          });
          await queryClient.invalidateQueries({
            queryKey: [
              "pos-movements",
            ],
          });
        },
      onError:
        (error) =>
          setMessage({
            kind: "error",
            text:
              readError(
                error,
                "No se pudo registrar el movimiento.",
              ),
          }),
    });

  const submitPoint =
    async (
      event: FormEvent<HTMLFormElement>,
    ) => {
      event.preventDefault();
      const data =
        new FormData(
          event.currentTarget,
        );

      const warehouseId =
        String(
          data.get(
            "warehouseId",
          ) ?? "",
        );

      const code =
        String(
          data.get("code") ??
          "",
        );

      const name =
        String(
          data.get("name") ??
          "",
        );

      if (editingPoint) {
        await updatePoint.mutateAsync({
          id:
            editingPoint.id,
          body: {
            warehouseId,
            code,
            name,
            active:
              data.get("active") ===
              "on",
          },
        });
        return;
      }

      if (!formStoreId) {
        setMessage({
          kind: "error",
          text:
            "Seleccione la sucursal del punto de venta.",
        });
        return;
      }

      await createPoint.mutateAsync({
        storeId:
          formStoreId,
        warehouseId,
        code,
        name,
      });

      event.currentTarget.reset();
    };

  const submitOpen =
    async (
      event: FormEvent<HTMLFormElement>,
    ) => {
      event.preventDefault();
      if (!selectedPoint) {
        return;
      }

      const data =
        new FormData(
          event.currentTarget,
        );

      await open.mutateAsync({
        pointOfSaleId:
          selectedPoint.id,
        openingAmount:
          Number(
            data.get(
              "openingAmount",
            ) ?? 0,
          ),
        openingNotes:
          String(
            data.get(
              "openingNotes",
            ) ?? "",
          ).trim() || null,
      });

      event.currentTarget.reset();
    };

  const submitMovement =
    async (
      event: FormEvent<HTMLFormElement>,
    ) => {
      event.preventDefault();
      if (!session) {
        return;
      }

      const data =
        new FormData(
          event.currentTarget,
        );

      await movement.mutateAsync({
        movementType:
          String(
            data.get(
              "movementType",
            ),
          ) as CashMovementType,
        amount:
          Number(
            data.get("amount") ??
            0,
          ),
        reason:
          String(
            data.get("reason") ??
            "",
          ),
      });

      event.currentTarget.reset();
    };

  const availableFor =
    (variantId: string) =>
      catalog.find(
        (item) =>
          item.variant.id ===
          variantId,
      )?.availableQuantity ?? 0;

  const addToCart =
    (item: PosCatalogItem) => {
      if (
        item.availableQuantity <=
        0
      ) {
        setMessage({
          kind: "error",
          text:
            "La variante no tiene stock disponible en el Warehouse del POS.",
        });
        return;
      }

      setCart(
        (current) => {
          const existing =
            current.find(
              (line) =>
                line.variantId ===
                item.variant.id,
            );

          if (!existing) {
            return [
              ...current,
              {
                variantId:
                  item.variant.id,
                productName:
                  item.productName,
                sku:
                  item.variant.sku,
                size:
                  item.variant.size,
                color:
                  item.variant.color,
                unitPrice:
                  item.variant.price,
                currency:
                  item.variant.currency,
                quantity: 1,
              },
            ];
          }

          if (
            existing.quantity >=
            Math.min(
              99,
              item.availableQuantity,
            )
          ) {
            return current;
          }

          return current.map(
            (line) =>
              line.variantId ===
                item.variant.id
                ? {
                    ...line,
                    quantity:
                      line.quantity + 1,
                  }
                : line,
          );
        },
      );
    };

  const changeQuantity =
    (
      variantId: string,
      delta: number,
    ) => {
      setCart(
        (current) =>
          current
            .map(
              (line) => {
                if (
                  line.variantId !==
                  variantId
                ) {
                  return line;
                }

                const next =
                  line.quantity +
                  delta;

                return {
                  ...line,
                  quantity:
                    Math.min(
                      Math.max(
                        next,
                        0,
                      ),
                      Math.min(
                        99,
                        availableFor(
                          variantId,
                        ),
                      ),
                    ),
                };
              },
            )
            .filter(
              (line) =>
                line.quantity > 0,
            ),
      );
    };

  const queueCashSale =
    async (
      request: CreatePosSaleRequest,
      snapshot: OfflinePosItemSnapshot[],
    ) => {
      if (!session) {
        return;
      }

      const entry:
        OfflinePosSaleEntry = {
          id:
            request.clientOperationId,
          userId:
            user.id,
          status: "PENDING",
          pointOfSaleId:
            session.pointOfSaleId,
          warehouseId:
            session.warehouseId,
          cashSessionId:
            session.id,
          request,
          items:
            snapshot,
          total,
          currency:
            snapshot[0]?.currency ??
            "BOB",
          createdAt:
            new Date().toISOString(),
          errorMessage: null,
        };

      await offlineCache.queuePosSale(
        entry,
      );
      await refreshOffline();
      setCart([]);
      setMessage({
        kind: "success",
        text:
          "Venta en efectivo guardada localmente. Se sincronizará al recuperar la conexión.",
      });
    };

  const createSale =
    async () => {
      if (
        !session ||
        cart.length === 0
      ) {
        return;
      }

      if (
        !online &&
        !posPaymentAllowedOffline(
          paymentMethod,
        )
      ) {
        setMessage({
          kind: "error",
          text:
            "Sin conexión solo se permiten ventas en efectivo. Tarjeta y QR requieren conexión.",
        });
        return;
      }

      for (const line of cart) {
        if (
          line.quantity >
          availableFor(
            line.variantId,
          )
        ) {
          setMessage({
            kind: "error",
            text:
              `Stock insuficiente para ${line.productName} · ${line.sku}.`,
          });
          return;
        }
      }

      const request:
        CreatePosSaleRequest = {
          clientOperationId:
            crypto.randomUUID(),
          clientCreatedAt:
            new Date().toISOString(),
          cashSessionId:
            session.id,
          customerId: null,
          paymentMethod,
          items:
            cart.map(
              (line) => ({
                variantId:
                  line.variantId,
                quantity:
                  line.quantity,
              }),
            ),
          notes:
            "Venta presencial registrada desde el POS web.",
        };

      const snapshot =
        cart.map(
          (line) => ({
            variantId:
              line.variantId,
            productName:
              line.productName,
            sku:
              line.sku,
            size:
              line.size,
            color:
              line.color,
            quantity:
              line.quantity,
            unitPrice:
              line.unitPrice,
            currency:
              line.currency,
          }),
        );

      if (!online) {
        await queueCashSale(
          request,
          snapshot,
        );
        return;
      }

      try {
        const sale =
          await veloraApi.createPosSale(
            operationsRole,
            request,
          );

        setCart([]);
        setMessage({
          kind: "success",
          text:
            sale.paymentStatus ===
              "PENDING"
              ? `Venta ${sale.orderNumber} reservada. Debe resolverse el pago ${sale.paymentMethod}.`
              : `Venta ${sale.orderNumber} completada y pagada.`,
        });

        await invalidatePosSaleData(
          queryClient,
        );
      }
      catch (error) {
        if (
          error instanceof ApiClientError &&
          error.status === 0 &&
          paymentMethod ===
            "CASH"
        ) {
          await queueCashSale(
            request,
            snapshot,
          );
          return;
        }

        setMessage({
          kind: "error",
          text:
            readError(
              error,
              "No se pudo registrar la venta.",
            ),
        });
      }
    };

  const syncLocal =
    async () => {
      const result =
        await syncOfflinePosSales(
          user.id,
          operationsRole,
        );

      await refreshOffline();
      await invalidatePosSaleData(
        queryClient,
      );

      setMessage({
        kind:
          result.conflicts > 0
            ? "error"
            : "success",
        text:
          result.conflicts > 0
            ? `${result.conflicts} venta(s) requieren revisión manual.`
            : `${result.synced} venta(s) local(es) sincronizada(s).`,
      });
    };

  const requestPaymentResolution =
    (
      sale: NonNullable<
        typeof pendingSales.data
      >[number],
      action:
        "confirm" |
        "fail" |
        "cancel",
    ) => {
      const labels = {
        confirm: {
          title:
            "Confirmar pago POS",
          message:
            `Confirmar el pago ${sale.paymentMethod} de ${sale.orderNumber}. La reserva se convertirá en venta física.`,
          confirmLabel:
            "Confirmar pago",
          destructive: false,
        },
        fail: {
          title:
            "Marcar pago como fallido",
          message:
            `El pedido ${sale.orderNumber} se cancelará y el stock comprometido será liberado.`,
          confirmLabel:
            "Marcar fallido",
          destructive: true,
        },
        cancel: {
          title:
            "Cancelar pago POS",
          message:
            `El pedido ${sale.orderNumber} se cancelará y el stock comprometido será liberado.`,
          confirmLabel:
            "Cancelar pago",
          destructive: true,
        },
      } as const;

      const label =
        labels[action];

      setConfirm({
        ...label,
        onConfirm:
          async () => {
            if (
              action ===
              "confirm"
            ) {
              await veloraApi.confirmPosPayment(
                operationsRole,
                sale.paymentId,
                {
                  reason:
                    "Pago POS confirmado desde React Web.",
                },
              );
            }
            else if (
              action ===
              "fail"
            ) {
              await veloraApi.failPosPayment(
                operationsRole,
                sale.paymentId,
                {
                  reason:
                    "Pago POS fallido desde React Web.",
                },
              );
            }
            else {
              await veloraApi.cancelPosPayment(
                operationsRole,
                sale.paymentId,
                {
                  reason:
                    "Pago POS cancelado desde React Web.",
                },
              );
            }

            setMessage({
              kind: "success",
              text:
                action === "confirm"
                  ? "Pago confirmado y venta completada."
                  : "Pago resuelto y reserva liberada.",
            });

            await invalidatePosSaleData(
              queryClient,
            );
          },
      });
    };

  const requestClose =
    (
      event: FormEvent<HTMLFormElement>,
    ) => {
      event.preventDefault();
      if (!session) {
        return;
      }

      if (!online) {
        setMessage({
          kind: "error",
          text:
            "No es posible cerrar la caja sin conexión.",
        });
        return;
      }

      if (
        localForSession.length >
        0
      ) {
        setMessage({
          kind: "error",
          text:
            `No se puede cerrar la caja: existen ${localForSession.length} venta(s) locales sin resolver.`,
        });
        return;
      }

      const data =
        new FormData(
          event.currentTarget,
        );

      const countedCashAmount =
        Number(
          data.get(
            "countedCashAmount",
          ) ?? 0,
        );

      const closingNotes =
        String(
          data.get(
            "closingNotes",
          ) ?? "",
        ).trim() || null;

      setConfirm({
        title:
          "Cerrar caja",
        message:
          `Cerrar ${session.sessionNumber}. El servidor validará pagos POS pendientes y calculará el efectivo esperado.`,
        confirmLabel:
          "Cerrar caja",
        destructive: true,
        onConfirm:
          async () => {
            const closed =
              await veloraApi.closeCash(
                operationsRole,
                session.id,
                {
                  countedCashAmount,
                  closingNotes,
                },
              );

            setCart([]);
            setMessage({
              kind: "success",
              text:
                `Caja cerrada. Esperado ${money(closed.expectedCashAmount ?? 0, closed.currency)} · contado ${money(closed.countedCashAmount ?? 0, closed.currency)} · diferencia ${money(closed.cashDifference ?? 0, closed.currency)}.`,
            });

            await invalidateSession(
              queryClient,
            );
          },
      });
    };

  if (!companyId) {
    return (
      <section className="page">
        <Notice>
          Seleccione una compañía o espere la resolución de la sucursal asignada.
        </Notice>
      </section>
    );
  }

  const movementIn =
    (movements.data ?? [])
      .filter(
        (item) =>
          item.movementType ===
          "CASH_IN",
      )
      .reduce(
        (
          sum,
          item,
        ) =>
          sum + item.amount,
        0,
      );

  const movementOut =
    (movements.data ?? [])
      .filter(
        (item) =>
          item.movementType ===
          "CASH_OUT",
      )
      .reduce(
        (
          sum,
          item,
        ) =>
          sum + item.amount,
        0,
      );

  return (
    <section className="page pos-page">
      <div className="page-heading">
        <span className="eyebrow">
          PUNTO DE VENTA
        </span>
        <h1>POS y cajas</h1>
        <p>
          Venta presencial por Warehouse, caja, pagos y sincronización offline idempotente.
        </p>
      </div>

      <Notice
        kind={
          online
            ? "success"
            : "info"
        }
      >
        {online
          ? "POS conectado. CASH, CARD y QR disponibles."
          : "POS sin conexión. Solo CASH puede guardarse localmente."}
      </Notice>

      {message ? (
        <Notice kind={message.kind}>
          {message.text}
        </Notice>
      ) : null}

      {user.role === "ADMIN" ? (
        <AdminPointConfiguration
          points={points.data ?? []}
          stores={stores.data ?? []}
          warehouses={warehouses.data ?? []}
          editingPoint={editingPoint}
          formStoreId={formStoreId}
          busy={
            createPoint.isPending ||
            updatePoint.isPending
          }
          onStoreChange={
            setFormStoreId
          }
          onEdit={
            (point) => {
              setEditingPoint(
                point,
              );
              setFormStoreId(
                point.storeId,
              );
            }
          }
          onCancelEdit={() => {
            setEditingPoint(null);
            setFormStoreId("");
          }}
          onSubmit={submitPoint}
        />
      ) : null}

      <div className="panel">
        <h2>Terminal operativo</h2>
        <label>
          Punto de venta
          <select
            value={selectedPointId}
            onChange={(event) => {
              setSelectedPointId(
                event.target.value,
              );
              setCart([]);
              setMessage(null);
            }}
          >
            <option value="">
              Seleccione un POS
            </option>
            {points.data?.map(
              (point) => (
                <option
                  key={point.id}
                  value={point.id}
                >
                  {point.storeName} · {point.name} · {point.code}{point.active ? "" : " · INACTIVO"}
                </option>
              ),
            )}
          </select>
        </label>
        {selectedPoint ? (
          <p>
            Warehouse: <strong>{selectedPoint.warehouseName}</strong>. Las ventas descuentan exclusivamente de este almacén.
          </p>
        ) : null}
      </div>

      {selectedPointId &&
      openSession.isLoading ? (
        <Notice>
          Consultando caja abierta…
        </Notice>
      ) : null}

      {selectedPoint &&
      (
        noOpenSession ||
        (!openSession.isLoading &&
          !session &&
          !openSession.error)
      ) ? (
        <OpenCashPanel
          disabled={
            !selectedPoint.active ||
            open.isPending
          }
          onSubmit={submitOpen}
        />
      ) : null}

      {openSession.error &&
      !noOpenSession ? (
        <Notice kind="error">
          {readError(
            openSession.error,
            "No se pudo consultar la caja abierta.",
          )}
        </Notice>
      ) : null}

      {session ? (
        <>
          <CashSessionPanel
            session={session}
            movementIn={movementIn}
            movementOut={movementOut}
            movements={
              movements.data ?? []
            }
            movementBusy={
              movement.isPending
            }
            localPending={
              localForSession.length
            }
            online={online}
            onMovement={
              submitMovement
            }
            onClose={
              requestClose
            }
          />

          <div className="pos-sale-layout">
            <div className="panel pos-catalog-panel">
              <div className="panel-heading-inline">
                <div>
                  <h2>Catálogo POS</h2>
                  <p>Disponibilidad del Warehouse asignado menos ventas locales aún no sincronizadas.</p>
                </div>
                <input
                  aria-label="Buscar producto POS"
                  placeholder="Buscar producto, SKU, color o talla"
                  value={search}
                  onChange={(event) =>
                    setSearch(
                      event.target.value,
                    )
                  }
                />
              </div>

              {catalog.length === 0 ? (
                <EmptyState title="Sin variantes disponibles">
                  Revise el stock del Warehouse o cambie la búsqueda.
                </EmptyState>
              ) : (
                <div className="pos-product-grid">
                  {catalog.map(
                    (item) => (
                      <button
                        type="button"
                        className="pos-product-card"
                        key={item.variant.id}
                        disabled={
                          item.availableQuantity <=
                          0
                        }
                        onClick={() =>
                          addToCart(item)
                        }
                      >
                        <strong>{item.productName}</strong>
                        <span>{item.variant.sku}</span>
                        <small>{item.variant.color} · {item.variant.size}</small>
                        <span>{money(item.variant.price, item.variant.currency)}</span>
                        <b>Disponible {item.availableQuantity}</b>
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>

            <div className="panel pos-cart-panel">
              <h2>Venta actual</h2>
              {cart.length === 0 ? (
                <EmptyState title="Venta vacía">
                  Seleccione productos del catálogo POS.
                </EmptyState>
              ) : (
                <div className="pos-cart-lines">
                  {cart.map(
                    (line) => (
                      <div
                        className="pos-cart-line"
                        key={line.variantId}
                      >
                        <div>
                          <strong>{line.productName}</strong>
                          <small>{line.sku} · {line.color}/{line.size}</small>
                        </div>
                        <div className="pos-qty">
                          <button
                            type="button"
                            onClick={() =>
                              changeQuantity(
                                line.variantId,
                                -1,
                              )
                            }
                          >−</button>
                          <span>{line.quantity}</span>
                          <button
                            type="button"
                            onClick={() =>
                              changeQuantity(
                                line.variantId,
                                1,
                              )
                            }
                          >+</button>
                        </div>
                        <span>{money(line.unitPrice * line.quantity, line.currency)}</span>
                      </div>
                    ),
                  )}
                </div>
              )}

              <div className="pos-payment-methods">
                {(
                  [
                    "CASH",
                    "CARD",
                    "QR",
                  ] as PosPaymentMethod[]
                ).map(
                  (method) => (
                    <button
                      key={method}
                      type="button"
                      className={
                        paymentMethod ===
                          method
                          ? "button primary"
                          : "button secondary"
                      }
                      disabled={
                        !online &&
                        method !==
                          "CASH"
                      }
                      onClick={() =>
                        setPaymentMethod(
                          method,
                        )
                      }
                    >
                      {method}
                    </button>
                  ),
                )}
              </div>

              <div className="pos-total">
                <span>Total</span>
                <strong>{money(total, cart[0]?.currency ?? "BOB")}</strong>
              </div>

              <div className="actions">
                <button
                  type="button"
                  className="button secondary"
                  disabled={
                    cart.length === 0
                  }
                  onClick={() =>
                    setCart([])
                  }
                >
                  Vaciar
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={
                    cart.length === 0
                  }
                  onClick={() =>
                    void createSale()
                  }
                >
                  {online
                    ? "Registrar venta"
                    : "Guardar CASH offline"}
                </button>
              </div>
            </div>
          </div>

          <PendingPaymentsPanel
            sales={
              pendingSales.data ?? []
            }
            onResolve={
              requestPaymentResolution
            }
          />

          <OfflineSalesPanel
            entries={
              localForSession
            }
            online={online}
            onSync={() =>
              void syncLocal()
            }
            onRetry={
              async (id) => {
                await offlineCache.retryPosSale(
                  id,
                );
                await refreshOffline();
              }
            }
            onDiscard={
              (entry) =>
                setConfirm({
                  title:
                    "Descartar venta local",
                  message:
                    `Descartar la operación local ${entry.id}. Esta acción libera únicamente la reserva visual local; no modifica ventas ya sincronizadas.`,
                  confirmLabel:
                    "Descartar",
                  destructive: true,
                  onConfirm:
                    async () => {
                      await offlineCache.discardPosSale(
                        entry.id,
                      );
                      await refreshOffline();
                    },
                })
            }
          />
        </>
      ) : null}

      <ConfirmDialog
        state={confirm}
        onClose={() =>
          setConfirm(null)
        }
      />
    </section>
  );
}

function useOnlineStatus(
  setOnline:
    (value: boolean) => void,
  refreshOffline:
    () => Promise<void>,
) {
  useEffect(
    () => {
      void refreshOffline();
    },
    [refreshOffline],
  );

  useEffect(
    () => {
      const handleOnline = () => {
        setOnline(true);
        void refreshOffline();
      };

      const handleOffline = () =>
        setOnline(false);

      window.addEventListener(
        "online",
        handleOnline,
      );
      window.addEventListener(
        "offline",
        handleOffline,
      );

      return () => {
        window.removeEventListener(
          "online",
          handleOnline,
        );
        window.removeEventListener(
          "offline",
          handleOffline,
        );
      };
    },
    [
      refreshOffline,
      setOnline,
    ],
  );
}

async function invalidateSession(
  client:
    ReturnType<typeof useQueryClient>,
) {
  await client.invalidateQueries({
    queryKey: [
      "pos-open-session",
    ],
  });
  await invalidatePosSaleData(
    client,
  );
}

async function invalidatePosSaleData(
  client:
    ReturnType<typeof useQueryClient>,
) {
  await Promise.all([
    client.invalidateQueries({
      queryKey: [
        "pos-stock",
      ],
    }),
    client.invalidateQueries({
      queryKey: [
        "pos-pending-sales",
      ],
    }),
    client.invalidateQueries({
      queryKey: [
        "pos-movements",
      ],
    }),
    client.invalidateQueries({
      queryKey: [
        "operational-orders",
      ],
    }),
  ]);
}

function AdminPointConfiguration(
  {
    points,
    stores,
    warehouses,
    editingPoint,
    formStoreId,
    busy,
    onStoreChange,
    onEdit,
    onCancelEdit,
    onSubmit,
  }: {
    points: PointOfSaleResponse[];
    stores:
      Array<{
        id: string;
        name: string;
      }>;
    warehouses:
      Array<{
        id: string;
        storeId: string;
        storeName: string;
        name: string;
        active: boolean;
      }>;
    editingPoint:
      PointOfSaleResponse | null;
    formStoreId: string;
    busy: boolean;
    onStoreChange:
      (value: string) => void;
    onEdit:
      (point: PointOfSaleResponse) => void;
    onCancelEdit:
      () => void;
    onSubmit:
      (event: FormEvent<HTMLFormElement>) => Promise<void>;
  },
) {
  const availableWarehouses =
    warehouses.filter(
      (warehouse) =>
        warehouse.storeId ===
          formStoreId &&
        warehouse.active,
    );

  return (
    <div className="two-columns">
      <form
        className="panel"
        key={
          editingPoint?.id ??
          "new-pos"
        }
        onSubmit={(event) =>
          void onSubmit(event)
        }
      >
        <h2>
          {editingPoint
            ? "Editar POS"
            : "Nuevo POS"}
        </h2>
        <label>
          Sucursal
          <select
            value={formStoreId}
            disabled={
              Boolean(editingPoint)
            }
            required
            onChange={(event) =>
              onStoreChange(
                event.target.value,
              )
            }
          >
            <option value="">
              Seleccione
            </option>
            {stores.map(
              (store) => (
                <option
                  key={store.id}
                  value={store.id}
                >
                  {store.name}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          Warehouse
          <select
            name="warehouseId"
            required
            defaultValue={
              editingPoint
                ?.warehouseId ??
              ""
            }
          >
            <option value="">
              Seleccione
            </option>
            {availableWarehouses.map(
              (warehouse) => (
                <option
                  key={warehouse.id}
                  value={warehouse.id}
                >
                  {warehouse.name}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          Código
          <input
            name="code"
            required
            maxLength={40}
            defaultValue={
              editingPoint?.code ??
              ""
            }
          />
        </label>
        <label>
          Nombre
          <input
            name="name"
            required
            maxLength={120}
            defaultValue={
              editingPoint?.name ??
              ""
            }
          />
        </label>
        {editingPoint ? (
          <label className="check-row">
            <input
              type="checkbox"
              name="active"
              defaultChecked={
                editingPoint.active
              }
            />
            Activo
          </label>
        ) : null}
        <div className="actions">
          {editingPoint ? (
            <button
              type="button"
              className="button secondary"
              onClick={
                onCancelEdit
              }
            >
              Cancelar
            </button>
          ) : null}
          <button
            className="button primary"
            disabled={busy}
          >
            {editingPoint
              ? "Guardar cambios"
              : "Crear POS"}
          </button>
        </div>
      </form>

      <div className="panel">
        <h2>Puntos configurados</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>POS</th>
                <th>Sucursal</th>
                <th>Warehouse</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {points.map(
                (point) => (
                  <tr key={point.id}>
                    <td>{point.code} · {point.name}</td>
                    <td>{point.storeName}</td>
                    <td>{point.warehouseName}</td>
                    <td>{point.active ? "Activo" : "Inactivo"}</td>
                    <td>
                      <button
                        type="button"
                        className="button small secondary"
                        onClick={() =>
                          onEdit(point)
                        }
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function OpenCashPanel(
  {
    disabled,
    onSubmit,
  }: {
    disabled: boolean;
    onSubmit:
      (event: FormEvent<HTMLFormElement>) => Promise<void>;
  },
) {
  return (
    <form
      className="panel"
      onSubmit={(event) =>
        void onSubmit(event)
      }
    >
      <h2>Abrir caja</h2>
      <div className="form-grid">
        <label>
          Fondo inicial
          <input
            name="openingAmount"
            type="number"
            min="0"
            step="0.01"
            defaultValue="0"
            required
          />
        </label>
        <label>
          Observaciones
          <input
            name="openingNotes"
            maxLength={500}
          />
        </label>
      </div>
      <button
        className="button primary"
        disabled={disabled}
      >
        Abrir caja
      </button>
    </form>
  );
}

function CashSessionPanel(
  {
    session,
    movementIn,
    movementOut,
    movements,
    movementBusy,
    localPending,
    online,
    onMovement,
    onClose,
  }: {
    session: CashSessionResponse;
    movementIn: number;
    movementOut: number;
    movements: CashMovementResponse[];
    movementBusy: boolean;
    localPending: number;
    online: boolean;
    onMovement:
      (event: FormEvent<HTMLFormElement>) => Promise<void>;
    onClose:
      (event: FormEvent<HTMLFormElement>) => void;
  },
) {
  return (
    <div className="two-columns">
      <div className="panel">
        <span className="eyebrow">CAJA ABIERTA</span>
        <h2>{session.sessionNumber}</h2>
        <div className="stat-grid compact">
          <div><span>Fondo</span><strong>{money(session.openingAmount, session.currency)}</strong></div>
          <div><span>Entradas</span><strong>{money(movementIn, session.currency)}</strong></div>
          <div><span>Salidas</span><strong>{money(movementOut, session.currency)}</strong></div>
          <div><span>Offline</span><strong>{localPending}</strong></div>
        </div>
        <p>Abierta: {new Date(session.openedAt).toLocaleString("es-BO")}</p>

        <form onSubmit={(event) => void onMovement(event)}>
          <h3>Movimiento manual</h3>
          <div className="form-grid">
            <label>
              Tipo
              <select name="movementType">
                <option value="CASH_IN">CASH_IN</option>
                <option value="CASH_OUT">CASH_OUT</option>
              </select>
            </label>
            <label>
              Monto
              <input name="amount" type="number" min="0.01" step="0.01" required />
            </label>
            <label>
              Motivo
              <input name="reason" maxLength={500} required />
            </label>
          </div>
          <button className="button secondary" disabled={movementBusy}>Registrar movimiento</button>
        </form>
      </div>

      <div className="panel">
        <h2>Cerrar caja</h2>
        <p>El efectivo esperado se calcula en servidor con fondo inicial + entradas − salidas + pagos CASH en PAID.</p>
        {!online ? <Notice kind="info">Debe recuperar conexión antes de cerrar.</Notice> : null}
        {localPending > 0 ? <Notice kind="info">Sincronice o resuelva las ventas locales antes de cerrar.</Notice> : null}
        <form onSubmit={onClose}>
          <label>
            Efectivo contado
            <input name="countedCashAmount" type="number" min="0" step="0.01" required />
          </label>
          <label>
            Observaciones
            <input name="closingNotes" maxLength={500} />
          </label>
          <button className="button danger" disabled={!online || localPending > 0}>Cerrar caja</button>
        </form>

        <h3>Movimientos</h3>
        <div className="table-wrap compact-table">
          <table>
            <thead><tr><th>Hora</th><th>Tipo</th><th>Monto</th><th>Motivo</th></tr></thead>
            <tbody>
              {movements.map((movement) => <tr key={movement.id}><td>{new Date(movement.createdAt).toLocaleTimeString("es-BO")}</td><td>{movement.movementType}</td><td>{money(movement.amount, session.currency)}</td><td>{movement.reason}</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PendingPaymentsPanel(
  {
    sales,
    onResolve,
  }: {
    sales: PosSaleResponse[];
    onResolve:
      (
        sale: PosSaleResponse,
        action: "confirm" | "fail" | "cancel",
      ) => void;
  },
) {
  return (
    <div className="panel">
      <h2>Pagos CARD / QR pendientes</h2>
      {sales.length === 0 ? (
        <EmptyState title="Sin pagos pendientes">
          Las ventas no efectivas ya fueron resueltas.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Pedido</th><th>Método</th><th>Total</th><th>Creado</th><th>Acciones</th></tr></thead>
            <tbody>
              {sales.map((sale) => <tr key={sale.paymentId}><td>{sale.orderNumber}</td><td>{sale.paymentMethod}</td><td>{money(sale.total, sale.currency)}</td><td>{new Date(sale.createdAt).toLocaleString("es-BO")}</td><td><div className="actions compact"><button type="button" className="button small primary" onClick={() => onResolve(sale, "confirm")}>Confirmar</button><button type="button" className="button small secondary" onClick={() => onResolve(sale, "fail")}>Fallido</button><button type="button" className="button small danger" onClick={() => onResolve(sale, "cancel")}>Cancelar</button></div></td></tr>)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OfflineSalesPanel(
  {
    entries,
    online,
    onSync,
    onRetry,
    onDiscard,
  }: {
    entries: OfflinePosSaleEntry[];
    online: boolean;
    onSync: () => void;
    onRetry: (id: string) => Promise<void>;
    onDiscard: (entry: OfflinePosSaleEntry) => void;
  },
) {
  return (
    <div className="panel">
      <div className="panel-heading-inline">
        <div>
          <h2>Ventas CASH offline</h2>
          <p>El mismo clientOperationId se conserva hasta que el servidor confirme el replay.</p>
        </div>
        <button type="button" className="button primary" disabled={!online || entries.length === 0} onClick={onSync}>Sincronizar</button>
      </div>
      {entries.length === 0 ? (
        <EmptyState title="Cola local vacía">
          No existen ventas offline pendientes para esta caja.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Operación</th><th>Estado</th><th>Total</th><th>Fecha</th><th>Detalle</th><th /></tr></thead>
            <tbody>
              {entries.map((entry) => <tr key={entry.id}><td><code>{entry.id.slice(0, 8)}…</code></td><td>{entry.status}</td><td>{money(entry.total, entry.currency)}</td><td>{new Date(entry.createdAt).toLocaleString("es-BO")}</td><td>{entry.errorMessage ?? `${entry.items.length} línea(s)`}</td><td><div className="actions compact">{entry.status === "CONFLICT" ? <button type="button" className="button small secondary" onClick={() => void onRetry(entry.id)}>Reintentar</button> : null}<button type="button" className="button small danger" onClick={() => onDiscard(entry)}>Descartar</button></div></td></tr>)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
