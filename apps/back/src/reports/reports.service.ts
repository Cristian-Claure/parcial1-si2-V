import {
  Injectable,
} from "@nestjs/common";

import type {
  ReportChart,
  ReportKpi,
  ReportOverview,
  ReportPeriodBounds,
  ReportTable,
} from "@velora/contracts";

import type {
  AuthPrincipal,
} from "../auth/security.js";

import {
  AccessContextService,
} from "../common/authz/access-context.service.js";

import {
  ApiHttpError,
} from "../common/http/api-http.error.js";

import {
  ReportsRepository,
} from "./reports.repository.js";

const REPORT_ZONE =
  "America/La_Paz";

const DAY_MS =
  86_400_000;

export interface ReportScope {
  companyId:
    string;
  storeId:
    string |
    null;
  label:
    string;
}

export interface ReportStoreOption {
  id:
    string;
  name:
    string;
}

interface ReportPeriod {
  from:
    string;
  to:
    string;
  start:
    Date;
  endExclusive:
    Date;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly repository:
      ReportsRepository,
    private readonly access:
      AccessContextService,
  ) {}

  async periodBounds(
    principal:
      AuthPrincipal,
    companyId:
      string |
      null,
    storeId:
      string |
      null,
  ): Promise<ReportPeriodBounds> {
    const scope =
      await this.resolveScope(
        principal,
        companyId,
        storeId,
      );

    const orders =
      await this.repository
        .findOrders(
          scope.companyId,
          scope.storeId,
        );

    const today =
      this.today();

    let minDate:
      string |
      null =
      null;

    for (
      const order of
      orders
    ) {
      const date =
        this.localDate(
          order.createdAt,
        );

      if (
        minDate ===
          null ||
        date <
          minDate
      ) {
        minDate =
          date;
      }
    }

    return {
      minDate:
        minDate ??
        this.shiftDate(
          today,
          -29,
        ),
      maxDate:
        today,
    };
  }

  async overview(
    principal:
      AuthPrincipal,
    companyId:
      string |
      null,
    requestedFrom:
      string |
      null,
    requestedTo:
      string |
      null,
    storeId:
      string |
      null,
  ): Promise<ReportOverview> {
    const scope =
      await this.resolveScope(
        principal,
        companyId,
        storeId,
      );

    const period =
      this.resolvePeriod(
        requestedFrom,
        requestedTo,
      );

    const [
      scopedOrders,
      scopedPayments,
      scopedStocks,
    ] =
      await Promise.all([
        this.repository
          .findOrders(
            scope.companyId,
            scope.storeId,
          ),
        this.repository
          .findPayments(
            scope.companyId,
            scope.storeId,
          ),
        this.repository
          .findStocks(
            scope.companyId,
            scope.storeId,
          ),
      ]);

    const paidEvents =
      scopedPayments.filter(
        (payment) =>
          payment.paidAt !==
            null &&
          this.inPeriod(
            payment.paidAt,
            period,
          ) &&
          (
            payment.status ===
              "PAID" ||
            payment.status ===
              "REFUNDED"
          ),
      );

    const refundEvents =
      scopedPayments.filter(
        (payment) =>
          payment.status ===
            "REFUNDED" &&
          payment.refundedAt !==
            null &&
          this.inPeriod(
            payment.refundedAt,
            period,
          ),
      );

    const grossSales =
      this.money(
        paidEvents.reduce(
          (
            total,
            payment,
          ) =>
            total +
            Number(
              payment.amount,
            ),
          0,
        ),
      );

    const refunds =
      this.money(
        refundEvents.reduce(
          (
            total,
            payment,
          ) =>
            total +
            Number(
              payment.amount,
            ),
          0,
        ),
      );

    const netSales =
      this.money(
        grossSales -
        refunds,
      );

    const paidOrderIds =
      new Set(
        paidEvents.map(
          (payment) =>
            payment.orderId,
        ),
      );

    const fulfilledOrders =
      scopedOrders.filter(
        (order) =>
          order.fulfilledAt !==
            null &&
          this.inPeriod(
            order.fulfilledAt,
            period,
          ),
      ).length;

    const createdOrders =
      scopedOrders.filter(
        (order) =>
          this.inPeriod(
            order.createdAt,
            period,
          ),
      ).length;

    const cancelledOrders =
      scopedOrders.filter(
        (order) =>
          order.cancelledAt !==
            null &&
          this.inPeriod(
            order.cancelledAt,
            period,
          ),
      ).length;

    const averageTicket =
      paidOrderIds.size ===
      0
        ? 0
        : this.money(
            grossSales /
            paidOrderIds.size,
          );

    const availableUnits =
      scopedStocks.reduce(
        (
          total,
          stock,
        ) =>
          total +
          Number(
            stock.availableQuantity,
          ),
        0,
      );

    const lowStockVariants =
      scopedStocks.filter(
        (stock) =>
          Number(
            stock.availableQuantity,
          ) <=
          3,
      ).length;

    const kpis:
      ReportKpi[] =
      [
        {
          key:
            "NET_SALES",
          label:
            "Venta neta",
          value:
            netSales,
          format:
            "CURRENCY",
          helper:
            "Cobros confirmados menos reembolsos del período.",
        },
        {
          key:
            "GROSS_SALES",
          label:
            "Venta bruta",
          value:
            grossSales,
          format:
            "CURRENCY",
          helper:
            "Cobros confirmados durante el período.",
        },
        {
          key:
            "PAID_ORDERS",
          label:
            "Pedidos pagados",
          value:
            paidOrderIds.size,
          format:
            "COUNT",
          helper:
            "Pedidos con al menos un pago confirmado.",
        },
        {
          key:
            "AVERAGE_TICKET",
          label:
            "Ticket promedio",
          value:
            averageTicket,
          format:
            "CURRENCY",
          helper:
            "Venta bruta dividida entre pedidos pagados.",
        },
        {
          key:
            "FULFILLED_ORDERS",
          label:
            "Pedidos completados",
          value:
            fulfilledOrders,
          format:
            "COUNT",
          helper:
            "Pedidos entregados o completados en el período.",
        },
        {
          key:
            "REFUNDS",
          label:
            "Reembolsos",
          value:
            refunds,
          format:
            "CURRENCY",
          helper:
            "Importe reembolsado durante el período.",
        },
        {
          key:
            "AVAILABLE_UNITS",
          label:
            "Stock disponible",
          value:
            availableUnits,
          format:
            "COUNT",
          helper:
            "Unidades disponibles actualmente en el alcance.",
        },
        {
          key:
            "LOW_STOCK_VARIANTS",
          label:
            "Variantes críticas",
          value:
            lowStockVariants,
          format:
            "COUNT",
          helper:
            "Variantes con 3 unidades disponibles o menos.",
        },
      ];

    const charts:
      ReportChart[] =
      [
        this.salesTrend(
          paidEvents,
          refundEvents,
          period,
        ),
        this.salesByStore(
          paidEvents,
          refundEvents,
        ),
        this.ordersByChannel(
          scopedOrders,
          period,
        ),
        this.paymentsByMethod(
          paidEvents,
        ),
        this.inventoryByStore(
          scopedStocks,
        ),
      ];

    const ranking =
      await this.topProducts(
        paidEvents,
        period,
      );

    const deterministicInsights =
      this.buildDeterministicInsights(
        netSales,
        refunds,
        createdOrders,
        cancelledOrders,
        lowStockVariants,
        ranking.topProduct,
      );

    return {
      title:
        "Resumen comercial VÉLORA",
      scopeLabel:
        scope.label,
      from:
        period.from,
      to:
        period.to,
      generatedAt:
        new Date()
          .toISOString(),
      kpis,
      charts,
      tables: [
        ranking.table,
      ],
      deterministicInsights,
    };
  }

  async availableStores(
    principal:
      AuthPrincipal,
    companyId:
      string |
      null,
  ): Promise<{
    scope:
      ReportScope;
    stores:
      ReportStoreOption[];
  }> {
    const scope =
      await this.resolveScope(
        principal,
        companyId,
        null,
      );

    if (
      scope.storeId
    ) {
      return {
        scope,
        stores: [
          {
            id:
              scope.storeId,
            name:
              scope.label,
          },
        ],
      };
    }

    return {
      scope,
      stores:
        await this.repository
          .listActiveStores(
            scope.companyId,
          ),
    };
  }

  private async resolveScope(
    principal:
      AuthPrincipal,
    requestedCompanyId:
      string |
      null,
    requestedStoreId:
      string |
      null,
  ): Promise<ReportScope> {
    const actor =
      await this.access
        .resolve(
          principal,
        );

    if (
      actor.role ===
      "STORE_MANAGER"
    ) {
      if (
        !actor.companyId ||
        !actor.storeId
      ) {
        throw new ApiHttpError(
          403,
          "El encargado no tiene una sucursal asignada.",
        );
      }

      if (
        requestedCompanyId &&
        requestedCompanyId !==
          actor.companyId
      ) {
        throw new ApiHttpError(
          403,
          "No puede consultar reportes de otra compañía.",
        );
      }

      if (
        requestedStoreId &&
        requestedStoreId !==
          actor.storeId
      ) {
        throw new ApiHttpError(
          403,
          "No puede consultar reportes de otra sucursal.",
        );
      }

      const store =
        await this.repository
          .findStore(
            actor.storeId,
          );

      if (
        !store ||
        store.companyId !==
          actor.companyId
      ) {
        throw new ApiHttpError(
          403,
          "La sucursal asignada al encargado no existe.",
        );
      }

      return {
        companyId:
          actor.companyId,
        storeId:
          actor.storeId,
        label:
          store.name,
      };
    }

    if (
      actor.role !==
      "ADMIN"
    ) {
      throw new ApiHttpError(
        403,
        "No tiene permisos para consultar reportes operativos.",
      );
    }

    if (
      !requestedCompanyId
    ) {
      throw new ApiHttpError(
        400,
        "Debe seleccionar una compañía para consultar reportes.",
      );
    }

    const company =
      await this.repository
        .findCompany(
          requestedCompanyId,
        );

    if (
      !company
    ) {
      throw new ApiHttpError(
        404,
        "Compañía no encontrada.",
      );
    }

    if (
      !company.active
    ) {
      throw new ApiHttpError(
        400,
        "La compañía seleccionada está inactiva.",
      );
    }

    if (
      !requestedStoreId
    ) {
      return {
        companyId:
          company.id,
        storeId:
          null,
        label:
          `Todas las sucursales · ${company.name}`,
      };
    }

    const store =
      await this.repository
        .findStore(
          requestedStoreId,
        );

    if (
      !store
    ) {
      throw new ApiHttpError(
        404,
        "Sucursal no encontrada.",
      );
    }

    if (
      store.companyId !==
      company.id
    ) {
      throw new ApiHttpError(
        403,
        "La sucursal no pertenece a la compañía seleccionada.",
      );
    }

    return {
      companyId:
        company.id,
      storeId:
        store.id,
      label:
        store.name,
    };
  }

  private resolvePeriod(
    requestedFrom:
      string |
      null,
    requestedTo:
      string |
      null,
  ): ReportPeriod {
    const today =
      this.today();

    const to =
      requestedTo
        ? this.validDate(
            requestedTo,
          )
        : today;

    const from =
      requestedFrom
        ? this.validDate(
            requestedFrom,
          )
        : this.shiftDate(
            to,
            -29,
          );

    if (
      from >
      to
    ) {
      throw new ApiHttpError(
        400,
        "La fecha inicial no puede ser posterior a la fecha final.",
      );
    }

    const endDate =
      this.shiftDate(
        to,
        1,
      );

    return {
      from,
      to,
      start:
        new Date(
          `${from}T00:00:00-04:00`,
        ),
      endExclusive:
        new Date(
          `${endDate}T00:00:00-04:00`,
        ),
    };
  }

  private salesTrend(
    paidEvents:
      Array<{
        amount:
          string;
        paidAt:
          Date |
          null;
      }>,
    refundEvents:
      Array<{
        amount:
          string;
        refundedAt:
          Date |
          null;
      }>,
    period:
      ReportPeriod,
  ): ReportChart {
    const days =
      this.daysBetween(
        period.from,
        period.to,
      ) +
      1;

    if (
      days <=
      45
    ) {
      return this.salesByDay(
        paidEvents,
        refundEvents,
        period,
      );
    }

    if (
      days <=
      180
    ) {
      return this.salesByWeek(
        paidEvents,
        refundEvents,
        period,
      );
    }

    return this.salesByMonth(
      paidEvents,
      refundEvents,
      period,
    );
  }

  private salesByDay(
    paidEvents:
      Array<{
        amount:
          string;
        paidAt:
          Date |
          null;
      }>,
    refundEvents:
      Array<{
        amount:
          string;
        refundedAt:
          Date |
          null;
      }>,
    period:
      ReportPeriod,
  ): ReportChart {
    const keys:
      string[] =
      [];

    let cursor =
      period.from;

    while (
      cursor <=
      period.to
    ) {
      keys.push(
        cursor,
      );
      cursor =
        this.shiftDate(
          cursor,
          1,
        );
    }

    const gross =
      this.zeroMap(
        keys,
      );
    const refunded =
      this.zeroMap(
        keys,
      );

    for (
      const payment of
      paidEvents
    ) {
      if (
        payment.paidAt
      ) {
        this.add(
          gross,
          this.localDate(
            payment.paidAt,
          ),
          Number(
            payment.amount,
          ),
        );
      }
    }

    for (
      const payment of
      refundEvents
    ) {
      if (
        payment.refundedAt
      ) {
        this.add(
          refunded,
          this.localDate(
            payment.refundedAt,
          ),
          Number(
            payment.amount,
          ),
        );
      }
    }

    return this.salesTrendChart(
      "Ventas por día",
      keys.map(
        (
          value,
        ) =>
          this.dayLabel(
            value,
          ),
      ),
      keys,
      gross,
      refunded,
    );
  }

  private salesByWeek(
    paidEvents:
      Array<{
        amount:
          string;
        paidAt:
          Date |
          null;
      }>,
    refundEvents:
      Array<{
        amount:
          string;
        refundedAt:
          Date |
          null;
      }>,
    period:
      ReportPeriod,
  ): ReportChart {
    const keys:
      string[] =
      [];

    let cursor =
      period.from;

    while (
      cursor <=
      period.to
    ) {
      keys.push(
        cursor,
      );
      cursor =
        this.shiftDate(
          cursor,
          7,
        );
    }

    const gross =
      this.zeroMap(
        keys,
      );
    const refunded =
      this.zeroMap(
        keys,
      );

    for (
      const payment of
      paidEvents
    ) {
      if (
        !payment.paidAt
      ) {
        continue;
      }

      const day =
        this.localDate(
          payment.paidAt,
        );
      const offset =
        this.daysBetween(
          period.from,
          day,
        );
      const bucket =
        this.shiftDate(
          period.from,
          Math.floor(
            offset /
            7,
          ) *
            7,
        );

      this.add(
        gross,
        bucket,
        Number(
          payment.amount,
        ),
      );
    }

    for (
      const payment of
      refundEvents
    ) {
      if (
        !payment.refundedAt
      ) {
        continue;
      }

      const day =
        this.localDate(
          payment.refundedAt,
        );
      const offset =
        this.daysBetween(
          period.from,
          day,
        );
      const bucket =
        this.shiftDate(
          period.from,
          Math.floor(
            offset /
            7,
          ) *
            7,
        );

      this.add(
        refunded,
        bucket,
        Number(
          payment.amount,
        ),
      );
    }

    return this.salesTrendChart(
      "Ventas por semana",
      keys.map(
        (
          start,
        ) => {
          const candidate =
            this.shiftDate(
              start,
              6,
            );
          const end =
            candidate >
            period.to
              ? period.to
              : candidate;

          return `${this.dayLabel(start)}–${this.dayLabel(end)}`;
        },
      ),
      keys,
      gross,
      refunded,
    );
  }

  private salesByMonth(
    paidEvents:
      Array<{
        amount:
          string;
        paidAt:
          Date |
          null;
      }>,
    refundEvents:
      Array<{
        amount:
          string;
        refundedAt:
          Date |
          null;
      }>,
    period:
      ReportPeriod,
  ): ReportChart {
    const keys:
      string[] =
      [];

    let cursor =
      `${period.from.slice(0, 7)}-01`;
    const last =
      `${period.to.slice(0, 7)}-01`;

    while (
      cursor <=
      last
    ) {
      keys.push(
        cursor,
      );
      cursor =
        this.shiftMonth(
          cursor,
          1,
        );
    }

    const gross =
      this.zeroMap(
        keys,
      );
    const refunded =
      this.zeroMap(
        keys,
      );

    for (
      const payment of
      paidEvents
    ) {
      if (
        payment.paidAt
      ) {
        const day =
          this.localDate(
            payment.paidAt,
          );
        this.add(
          gross,
          `${day.slice(0, 7)}-01`,
          Number(
            payment.amount,
          ),
        );
      }
    }

    for (
      const payment of
      refundEvents
    ) {
      if (
        payment.refundedAt
      ) {
        const day =
          this.localDate(
            payment.refundedAt,
          );
        this.add(
          refunded,
          `${day.slice(0, 7)}-01`,
          Number(
            payment.amount,
          ),
        );
      }
    }

    return this.salesTrendChart(
      "Ventas por mes",
      keys.map(
        (
          value,
        ) =>
          `${value.slice(5, 7)}/${value.slice(0, 4)}`,
      ),
      keys,
      gross,
      refunded,
    );
  }

  private salesTrendChart(
    title:
      string,
    categories:
      string[],
    keys:
      string[],
    gross:
      Map<
        string,
        number
      >,
    refunded:
      Map<
        string,
        number
      >,
  ): ReportChart {
    const grossData =
      keys.map(
        (
          key,
        ) =>
          this.money(
            gross.get(
              key,
            ) ??
            0,
          ),
      );

    const refundData =
      keys.map(
        (
          key,
        ) =>
          this.money(
            refunded.get(
              key,
            ) ??
            0,
          ),
      );

    const netData =
      keys.map(
        (
          key,
        ) =>
          this.money(
            (
              gross.get(
                key,
              ) ??
              0
            ) -
            (
              refunded.get(
                key,
              ) ??
              0
            ),
          ),
      );

    return {
      id:
        "sales-daily",
      title,
      type:
        "LINE",
      categories,
      series: [
        {
          name:
            "Venta bruta",
          data:
            grossData,
        },
        {
          name:
            "Reembolsos",
          data:
            refundData,
        },
        {
          name:
            "Venta neta",
          data:
            netData,
        },
      ],
    };
  }

  private salesByStore(
    paidEvents:
      Array<{
        amount:
          string;
        storeName:
          string;
      }>,
    refundEvents:
      Array<{
        amount:
          string;
        storeName:
          string;
      }>,
  ): ReportChart {
    const gross =
      new Map<
        string,
        number
      >();
    const refunded =
      new Map<
        string,
        number
      >();

    for (
      const payment of
      paidEvents
    ) {
      this.add(
        gross,
        payment.storeName,
        Number(
          payment.amount,
        ),
      );
    }

    for (
      const payment of
      refundEvents
    ) {
      this.add(
        refunded,
        payment.storeName,
        Number(
          payment.amount,
        ),
      );
    }

    const categories =
      [
        ...new Set([
          ...gross.keys(),
          ...refunded.keys(),
        ]),
      ].sort(
        (
          left,
          right,
        ) =>
          left.localeCompare(
            right,
            "es",
            {
              sensitivity:
                "base",
            },
          ),
      );

    return {
      id:
        "sales-store",
      title:
        "Venta neta por sucursal",
      type:
        "BAR",
      categories,
      series: [
        {
          name:
            "Venta neta",
          data:
            categories.map(
              (
                store,
              ) =>
                this.money(
                  (
                    gross.get(
                      store,
                    ) ??
                    0
                  ) -
                  (
                    refunded.get(
                      store,
                    ) ??
                    0
                  ),
                ),
            ),
        },
      ],
    };
  }

  private ordersByChannel(
    scopedOrders:
      Array<{
        orderChannel:
          "ECOMMERCE" |
          "POS";
        createdAt:
          Date;
      }>,
    period:
      ReportPeriod,
  ): ReportChart {
    let ecommerce =
      0;
    let pos =
      0;

    for (
      const order of
      scopedOrders
    ) {
      if (
        !this.inPeriod(
          order.createdAt,
          period,
        )
      ) {
        continue;
      }

      if (
        order.orderChannel ===
        "POS"
      ) {
        pos +=
          1;
      }
      else {
        ecommerce +=
          1;
      }
    }

    return {
      id:
        "orders-channel",
      title:
        "Pedidos por canal",
      type:
        "DONUT",
      categories: [
        "Ecommerce",
        "POS",
      ],
      series: [
        {
          name:
            "Pedidos",
          data: [
            ecommerce,
            pos,
          ],
        },
      ],
    };
  }

  private paymentsByMethod(
    paidEvents:
      Array<{
        method:
          "COD" |
          "CASH" |
          "CARD" |
          "WEB" |
          "QR";
        amount:
          string;
      }>,
  ): ReportChart {
    const totals =
      new Map<
        string,
        number
      >();

    for (
      const payment of
      paidEvents
    ) {
      this.add(
        totals,
        payment.method,
        Number(
          payment.amount,
        ),
      );
    }

    const methods =
      [
        ...totals.keys(),
      ].sort();

    return {
      id:
        "payments-method",
      title:
        "Cobros por método",
      type:
        "DONUT",
      categories:
        methods.map(
          (
            method,
          ) =>
            this.paymentMethodLabel(
              method,
            ),
        ),
      series: [
        {
          name:
            "Cobrado",
          data:
            methods.map(
              (
                method,
              ) =>
                this.money(
                  totals.get(
                    method,
                  ) ??
                  0,
                ),
            ),
        },
      ],
    };
  }

  private inventoryByStore(
    stocks:
      Array<{
        storeName:
          string;
        availableQuantity:
          number |
          null;
      }>,
  ): ReportChart {
    const totals =
      new Map<
        string,
        number
      >();

    for (
      const stock of
      stocks
    ) {
      this.add(
        totals,
        stock.storeName,
        Number(
          stock.availableQuantity,
        ),
      );
    }

    const categories =
      [
        ...totals.keys(),
      ].sort(
        (
          left,
          right,
        ) =>
          left.localeCompare(
            right,
            "es",
            {
              sensitivity:
                "base",
            },
          ),
      );

    return {
      id:
        "inventory-store",
      title:
        "Stock disponible por sucursal",
      type:
        "BAR",
      categories,
      series: [
        {
          name:
            "Unidades disponibles",
          data:
            categories.map(
              (
                store,
              ) =>
                totals.get(
                  store,
                ) ??
                0,
            ),
        },
      ],
    };
  }

  private async topProducts(
    paidEvents:
      Array<{
        orderId:
          string;
        status:
          "PENDING" |
          "PAID" |
          "FAILED" |
          "CANCELLED" |
          "REFUNDED";
        paidAt:
          Date |
          null;
      }>,
    period:
      ReportPeriod,
  ): Promise<{
    table:
      ReportTable;
    topProduct:
      string |
      null;
  }> {
    const retainedOrderIds =
      [
        ...new Set(
          paidEvents
            .filter(
              (payment) =>
                payment.status ===
                  "PAID" &&
                payment.paidAt !==
                  null &&
                this.inPeriod(
                  payment.paidAt,
                  period,
                ),
            )
            .map(
              (payment) =>
                payment.orderId,
            ),
        ),
      ];

    const items =
      await this.repository
        .findOrderItems(
          retainedOrderIds,
        );

    const quantities =
      new Map<
        string,
        number
      >();
    const revenues =
      new Map<
        string,
        number
      >();

    for (
      const item of
      items
    ) {
      this.add(
        quantities,
        item.productName,
        item.quantity,
      );
      this.add(
        revenues,
        item.productName,
        Number(
          item.subtotal,
        ),
      );
    }

    const products =
      [
        ...revenues.keys(),
      ].sort(
        (
          left,
          right,
        ) =>
          (
            revenues.get(
              right,
            ) ??
            0
          ) -
          (
            revenues.get(
              left,
            ) ??
            0
          ),
      );

    const rows =
      products
        .slice(
          0,
          10,
        )
        .map(
          (
            product,
          ) => [
            product,
            String(
              quantities.get(
                product,
              ) ??
              0,
            ),
            this.money(
              revenues.get(
                product,
              ) ??
              0,
            ).toFixed(
              2,
            ),
          ],
        );

    return {
      table: {
        id:
          "top-products",
        title:
          "Top productos por venta confirmada",
        columns: [
          "Producto",
          "Unidades",
          "Venta Bs",
        ],
        rows,
      },
      topProduct:
        products[0] ??
        null,
    };
  }

  private buildDeterministicInsights(
    netSales:
      number,
    refunds:
      number,
    createdOrders:
      number,
    cancelledOrders:
      number,
    lowStockVariants:
      number,
    topProduct:
      string |
      null,
  ): string[] {
    const insights:
      string[] =
      [];

    if (
      netSales >
      0
    ) {
      insights.push(
        `La venta neta del período fue de Bs ${this.money(netSales).toFixed(2)}.`,
      );
    }

    if (
      createdOrders >
      0
    ) {
      const cancellationRate =
        Math.round(
          (
            cancelledOrders *
            1000
          ) /
          createdOrders,
        ) /
        10;

      insights.push(
        `La tasa de cancelación del período fue ${cancellationRate.toFixed(1)}%.`,
      );
    }

    if (
      refunds >
      0
    ) {
      insights.push(
        `Se registraron reembolsos por Bs ${this.money(refunds).toFixed(2)}.`,
      );
    }

    if (
      topProduct
    ) {
      insights.push(
        `El producto con mayor venta confirmada fue ${topProduct}.`,
      );
    }

    if (
      lowStockVariants >
      0
    ) {
      insights.push(
        `${lowStockVariants} variantes tienen 3 unidades disponibles o menos.`,
      );
    }

    if (
      insights.length ===
      0
    ) {
      insights.push(
        "No existen suficientes operaciones en el período para destacar tendencias.",
      );
    }

    return insights;
  }

  private inPeriod(
    value:
      Date,
    period:
      ReportPeriod,
  ): boolean {
    return (
      value.getTime() >=
        period.start.getTime() &&
      value.getTime() <
        period.endExclusive.getTime()
    );
  }

  private today():
    string {
    return this.localDate(
      new Date(),
    );
  }

  private localDate(
    value:
      Date,
  ): string {
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
        value,
      );

    const year =
      parts.find(
        (
          part,
        ) =>
          part.type ===
          "year",
      )?.value;
    const month =
      parts.find(
        (
          part,
        ) =>
          part.type ===
          "month",
      )?.value;
    const day =
      parts.find(
        (
          part,
        ) =>
          part.type ===
          "day",
      )?.value;

    if (
      !year ||
      !month ||
      !day
    ) {
      throw new Error(
        "No se pudo resolver una fecha de reporte.",
      );
    }

    return `${year}-${month}-${day}`;
  }

  private validDate(
    value:
      string,
  ): string {
    if (
      !/^\d{4}-\d{2}-\d{2}$/
        .test(
          value,
        )
    ) {
      throw new ApiHttpError(
        400,
        "La fecha debe usar YYYY-MM-DD.",
      );
    }

    const parsed =
      new Date(
        `${value}T00:00:00Z`,
      );

    if (
      Number.isNaN(
        parsed.getTime(),
      ) ||
      parsed
        .toISOString()
        .slice(
          0,
          10,
        ) !==
        value
    ) {
      throw new ApiHttpError(
        400,
        "La fecha indicada no es válida.",
      );
    }

    return value;
  }

  private shiftDate(
    value:
      string,
    days:
      number,
  ): string {
    const date =
      new Date(
        `${this.validDate(value)}T00:00:00Z`,
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
        `${this.validDate(value)}T00:00:00Z`,
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

  private daysBetween(
    from:
      string,
    to:
      string,
  ): number {
    const start =
      new Date(
        `${this.validDate(from)}T00:00:00Z`,
      ).getTime();
    const end =
      new Date(
        `${this.validDate(to)}T00:00:00Z`,
      ).getTime();

    return Math.round(
      (
        end -
        start
      ) /
      DAY_MS,
    );
  }

  private dayLabel(
    value:
      string,
  ): string {
    this.validDate(
      value,
    );

    return `${value.slice(8, 10)}/${value.slice(5, 7)}`;
  }

  private zeroMap(
    keys:
      string[],
  ): Map<
    string,
    number
  > {
    return new Map(
      keys.map(
        (
          key,
        ) => [
          key,
          0,
        ],
      ),
    );
  }

  private add(
    map:
      Map<
        string,
        number
      >,
    key:
      string,
    amount:
      number,
  ): void {
    map.set(
      key,
      (
        map.get(
          key,
        ) ??
        0
      ) +
      amount,
    );
  }

  private money(
    value:
      number,
  ): number {
    return Math.round(
      (
        value +
        Number.EPSILON
      ) *
      100,
    ) /
    100;
  }

  private paymentMethodLabel(
    method:
      string,
  ): string {
    switch (
      method
    ) {
      case "COD":
        return "Contra entrega";
      case "CASH":
        return "Efectivo";
      case "CARD":
        return "Tarjeta";
      case "WEB":
        return "Pago web";
      case "QR":
        return "QR";
      default:
        return method;
    }
  }
}
