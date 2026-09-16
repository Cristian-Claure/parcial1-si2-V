import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (col: unknown, val: unknown) => ({ __op: "eq" as const, col, val }),
    and: (...conds: unknown[]) => ({ __op: "and" as const, conds }),
    asc: (col: unknown) => ({ __op: "asc" as const, col }),
    desc: (col: unknown) => ({ __op: "desc" as const, col }),
  };
});

import {
  customerAddresses,
  inventoryStocks,
  orders,
  productVariants,
  products,
  stores,
  warehouses,
} from "@velora/database";

import { OrdersRepository } from "./orders.repository.js";

type Cond =
  | { __op: "eq"; col: unknown; val: unknown }
  | { __op: "and"; conds: Cond[] }
  | { __op: "asc" | "desc"; col: unknown };

type Row = Record<string, unknown>;

const TABLE_NAME = new Map<unknown, string>([
  [warehouses, "warehouses"],
  [stores, "stores"],
  [customerAddresses, "customerAddresses"],
  [productVariants, "productVariants"],
  [products, "products"],
  [inventoryStocks, "inventoryStocks"],
  [orders, "orders"],
]);

const COLUMN_MAP = new Map<unknown, { table: string; field: string }>([
  [warehouses.id, { table: "warehouses", field: "id" }],
  [warehouses.storeId, { table: "warehouses", field: "storeId" }],
  [warehouses.active, { table: "warehouses", field: "active" }],
  [warehouses.defaultWarehouse, { table: "warehouses", field: "defaultWarehouse" }],
  [stores.id, { table: "stores", field: "id" }],
  [stores.name, { table: "stores", field: "name" }],
  [stores.address, { table: "stores", field: "address" }],
  [stores.companyId, { table: "stores", field: "companyId" }],
  [stores.active, { table: "stores", field: "active" }],
  [customerAddresses.id, { table: "customerAddresses", field: "id" }],
  [customerAddresses.userId, { table: "customerAddresses", field: "userId" }],
  [customerAddresses.active, { table: "customerAddresses", field: "active" }],
  [customerAddresses.recipientName, { table: "customerAddresses", field: "recipientName" }],
  [customerAddresses.recipientPhone, { table: "customerAddresses", field: "recipientPhone" }],
  [customerAddresses.department, { table: "customerAddresses", field: "department" }],
  [customerAddresses.city, { table: "customerAddresses", field: "city" }],
  [customerAddresses.zone, { table: "customerAddresses", field: "zone" }],
  [customerAddresses.addressLine, { table: "customerAddresses", field: "addressLine" }],
  [customerAddresses.reference, { table: "customerAddresses", field: "reference" }],
  [productVariants.id, { table: "productVariants", field: "id" }],
  [productVariants.productId, { table: "productVariants", field: "productId" }],
  [productVariants.sku, { table: "productVariants", field: "sku" }],
  [productVariants.size, { table: "productVariants", field: "size" }],
  [productVariants.color, { table: "productVariants", field: "color" }],
  [productVariants.price, { table: "productVariants", field: "price" }],
  [productVariants.currency, { table: "productVariants", field: "currency" }],
  [productVariants.active, { table: "productVariants", field: "variantActive" }],
  [products.id, { table: "products", field: "id" }],
  [products.name, { table: "products", field: "productName" }],
  [products.status, { table: "products", field: "productStatus" }],
  [products.companyId, { table: "products", field: "productCompanyId" }],
  [inventoryStocks.id, { table: "inventoryStocks", field: "id" }],
  [inventoryStocks.warehouseId, { table: "inventoryStocks", field: "warehouseId" }],
  [inventoryStocks.variantId, { table: "inventoryStocks", field: "variantId" }],
  [inventoryStocks.physicalQuantity, { table: "inventoryStocks", field: "physicalQuantity" }],
  [inventoryStocks.committedQuantity, { table: "inventoryStocks", field: "committedQuantity" }],
  [orders.id, { table: "orders", field: "id" }],
  [orders.customerId, { table: "orders", field: "customerId" }],
  [orders.orderChannel, { table: "orders", field: "orderChannel" }],
  [orders.warehouseId, { table: "orders", field: "warehouseId" }],
  [orders.fulfillmentType, { table: "orders", field: "fulfillmentType" }],
  [orders.addressId, { table: "orders", field: "addressId" }],
  [orders.clientCreatedAt, { table: "orders", field: "clientCreatedAt" }],
  [orders.notes, { table: "orders", field: "notes" }],
  [orders.clientOperationId, { table: "orders", field: "clientOperationId" }],
]);

function resolve(x: unknown, tuple: Record<string, Row>): unknown {
  const mapped = COLUMN_MAP.get(x);
  if (mapped) return tuple[mapped.table]?.[mapped.field];
  return x;
}

function evalCond(cond: Cond, tuple: Record<string, Row>): boolean {
  if (cond.__op === "and") return cond.conds.every((c) => evalCond(c, tuple));
  if (cond.__op === "eq") return resolve(cond.col, tuple) === resolve(cond.val, tuple);
  throw new Error("unsupported condition in test fake: " + cond.__op);
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

interface Fixtures {
  warehouses: Row[];
  stores: Row[];
  customerAddresses: Row[];
  productVariants: Row[];
  products: Row[];
  inventoryStocks: Row[];
  orders: Row[];
}

function createFakeTx(fixtures: Fixtures) {
  function select(selection: Record<string, unknown>) {
    let table: unknown;
    const joins: { table: unknown; on: Cond }[] = [];
    let whereCond: Cond | null = null;
    let orderBys: Cond[] = [];
    let limitN: number | null = null;

    const run = (): Row[] => {
      const baseName = TABLE_NAME.get(table);
      if (!baseName) throw new Error("unknown table in test fake");
      let tuples: Record<string, Row>[] = fixtures[baseName as keyof Fixtures].map((r) => ({ [baseName]: r }));
      for (const j of joins) {
        const joinName = TABLE_NAME.get(j.table);
        if (!joinName) throw new Error("unknown join table in test fake");
        const joinRows = fixtures[joinName as keyof Fixtures];
        tuples = tuples.flatMap((tuple) =>
          joinRows
            .filter((jr) => evalCond(j.on, { ...tuple, [joinName]: jr }))
            .map((jr) => ({ ...tuple, [joinName]: jr })),
        );
      }
      if (whereCond) tuples = tuples.filter((t) => evalCond(whereCond as Cond, t));
      if (orderBys.length) {
        tuples = [...tuples].sort((a, b) => {
          for (const ob of orderBys) {
            const col = (ob as { col: unknown }).col;
            const diff = compare(resolve(col, a), resolve(col, b));
            if (diff !== 0) return ob.__op === "desc" ? -diff : diff;
          }
          return 0;
        });
      }
      if (limitN !== null) tuples = tuples.slice(0, limitN);
      return tuples.map((tuple) => {
        const out: Row = {};
        for (const [key, col] of Object.entries(selection)) out[key] = resolve(col, tuple);
        return out;
      });
    };

    const builder = {
      from(t: unknown) {
        table = t;
        return builder;
      },
      innerJoin(t: unknown, on: Cond) {
        joins.push({ table: t, on });
        return builder;
      },
      where(cond: Cond) {
        whereCond = cond;
        return builder;
      },
      orderBy(...obs: Cond[]) {
        orderBys = obs;
        return builder;
      },
      limit(n: number) {
        limitN = n;
        return builder;
      },
      then(onFulfilled: (rows: Row[]) => unknown, onRejected?: (err: unknown) => unknown) {
        try {
          return Promise.resolve(onFulfilled(run()));
        } catch (err) {
          if (onRejected) return Promise.resolve(onRejected(err));
          throw err;
        }
      },
    };
    return builder;
  }

  return {
    execute: vi.fn().mockResolvedValue(undefined),
    select,
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    update: vi.fn(() => ({
      set: () => ({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    })),
  };
}

const COMPANY = "10000000-0000-0000-0000-000000000001";
const STORE = "20000000-0000-4000-8000-000000000001";
const DEFAULT_WAREHOUSE = "30000000-0000-4000-8000-000000000001";
const SECONDARY_WAREHOUSE = "30000000-0000-4000-8000-000000000002";
const VARIANT = "60000000-0000-4000-8000-000000000001";

function baseFixtures(): Fixtures {
  return {
    warehouses: [
      { id: DEFAULT_WAREHOUSE, storeId: STORE, active: true, defaultWarehouse: true },
      { id: SECONDARY_WAREHOUSE, storeId: STORE, active: true, defaultWarehouse: false },
    ],
    stores: [{ id: STORE, name: "Equipetrol", address: "Av. San Martín", companyId: COMPANY, active: true }],
    customerAddresses: [],
    productVariants: [{ id: VARIANT, productId: "product-1", sku: "SKU-1", size: "M", color: "Negro", price: "100.00", currency: "BOB", variantActive: true }],
    products: [{ id: "product-1", productName: "Polera", productStatus: "ACTIVE", productCompanyId: COMPANY }],
    inventoryStocks: [],
    orders: [],
  };
}

function saleLine(overrides: Partial<Row> = {}) {
  return {
    variantId: VARIANT,
    quantity: 5,
    productName: "Polera",
    productStatus: "ACTIVE" as const,
    productCompanyId: COMPANY,
    sku: "SKU-1",
    size: "M",
    color: "Negro",
    price: "100.00",
    currency: "BOB",
    variantActive: true,
    ...overrides,
  };
}

interface PrivateOrdersRepository {
  warehouseForCheckout(tx: unknown, warehouseId: string): Promise<unknown>;
  lockAndAllocateLine(
    tx: unknown,
    warehouse: Row,
    line: Row,
    requested: number,
    fulfillmentType: "PICKUP" | "DELIVERY",
  ): Promise<unknown>;
}

let repo: OrdersRepository;
let privateRepo: PrivateOrdersRepository;

beforeEach(() => {
  repo = new OrdersRepository({} as never);
  privateRepo = repo as unknown as PrivateOrdersRepository;
});

describe("OrdersRepository#warehouseForCheckout (private, real logic)", () => {
  it("returns WAREHOUSE_NOT_FOUND when the warehouse does not exist", async () => {
    const tx = createFakeTx(baseFixtures());
    const result = await privateRepo.warehouseForCheckout(tx, "nonexistent-id");
    expect(result).toEqual({ kind: "WAREHOUSE_NOT_FOUND" });
  });

  it("returns WAREHOUSE_INACTIVE when the warehouse exists but is inactive", async () => {
    const fixtures = baseFixtures();
    fixtures.warehouses[0]!.active = false;
    const tx = createFakeTx(fixtures);
    const result = await privateRepo.warehouseForCheckout(tx, DEFAULT_WAREHOUSE);
    expect(result).toEqual({ kind: "WAREHOUSE_INACTIVE" });
  });

  it("returns OK with the joined store record when active", async () => {
    const tx = createFakeTx(baseFixtures());
    const result = await privateRepo.warehouseForCheckout(tx, DEFAULT_WAREHOUSE);
    expect(result).toMatchObject({
      kind: "OK",
      warehouse: {
        id: DEFAULT_WAREHOUSE,
        storeId: STORE,
        storeName: "Equipetrol",
        companyId: COMPANY,
        active: true,
        defaultWarehouse: true,
        storeActive: true,
      },
    });
  });
});

describe("OrdersRepository#lockAndAllocateLine (private, real logic)", () => {
  const call = (tx: unknown, warehouse: Row, line: Row, requested: number, fulfillmentType: "PICKUP" | "DELIVERY") =>
    privateRepo.lockAndAllocateLine(tx, warehouse, line, requested, fulfillmentType);

  const pickupWarehouse = { id: DEFAULT_WAREHOUSE, storeId: STORE, companyId: COMPANY };

  it("rejects when the variant is inactive or the product is not ACTIVE", async () => {
    const fixtures = baseFixtures();
    const tx = createFakeTx(fixtures);
    const result = await call(tx, pickupWarehouse, saleLine({ variantActive: false }), 1, "PICKUP");
    expect(result).toEqual({ kind: "VARIANT_UNAVAILABLE" });
  });

  it("rejects when the product's company does not match the warehouse's company", async () => {
    const fixtures = baseFixtures();
    const tx = createFakeTx(fixtures);
    const result = await call(tx, pickupWarehouse, saleLine({ productCompanyId: "other-company" }), 1, "PICKUP");
    expect(result).toEqual({ kind: "COMPANY_MISMATCH" });
  });

  it("PICKUP only allocates from the requested warehouse, ignoring stock at sibling warehouses", async () => {
    const fixtures = baseFixtures();
    fixtures.inventoryStocks = [
      { id: "stock-default", warehouseId: DEFAULT_WAREHOUSE, variantId: VARIANT, physicalQuantity: 5, committedQuantity: 0 },
      { id: "stock-secondary", warehouseId: SECONDARY_WAREHOUSE, variantId: VARIANT, physicalQuantity: 1000, committedQuantity: 0 },
    ];
    const tx = createFakeTx(fixtures);
    const result = await call(tx, pickupWarehouse, saleLine({ quantity: 5 }), 5, "PICKUP");
    expect(result).toMatchObject({
      kind: "OK",
      allocations: [{ warehouseId: DEFAULT_WAREHOUSE, quantity: 5 }],
    });
  });

  it("PICKUP reports STOCK_INSUFFICIENT scoped to the requested warehouse even when a sibling warehouse has enough stock", async () => {
    const fixtures = baseFixtures();
    fixtures.inventoryStocks = [
      { id: "stock-default", warehouseId: DEFAULT_WAREHOUSE, variantId: VARIANT, physicalQuantity: 5, committedQuantity: 0 },
      { id: "stock-secondary", warehouseId: SECONDARY_WAREHOUSE, variantId: VARIANT, physicalQuantity: 1000, committedQuantity: 0 },
    ];
    const tx = createFakeTx(fixtures);
    const result = await call(tx, pickupWarehouse, saleLine({ quantity: 6 }), 6, "PICKUP");
    expect(result).toEqual({ kind: "STOCK_INSUFFICIENT", sku: "SKU-1", available: 5, requested: 6 });
  });

  it("DELIVERY pools stock across active warehouses of the store, preferring the default warehouse first", async () => {
    const fixtures = baseFixtures();
    fixtures.inventoryStocks = [
      { id: "stock-default", warehouseId: DEFAULT_WAREHOUSE, variantId: VARIANT, physicalQuantity: 3, committedQuantity: 0 },
      { id: "stock-secondary", warehouseId: SECONDARY_WAREHOUSE, variantId: VARIANT, physicalQuantity: 20, committedQuantity: 0 },
    ];
    const tx = createFakeTx(fixtures);
    const warehouse = { id: DEFAULT_WAREHOUSE, storeId: STORE, companyId: COMPANY };
    const result = await call(tx, warehouse, saleLine({ quantity: 10 }), 10, "DELIVERY");
    expect(result).toMatchObject({
      kind: "OK",
      allocations: [
        { warehouseId: DEFAULT_WAREHOUSE, quantity: 3 },
        { warehouseId: SECONDARY_WAREHOUSE, quantity: 7 },
      ],
    });
  });

  it("DELIVERY excludes inactive warehouses from the pool", async () => {
    const fixtures = baseFixtures();
    fixtures.warehouses[1]!.active = false;
    fixtures.inventoryStocks = [
      { id: "stock-default", warehouseId: DEFAULT_WAREHOUSE, variantId: VARIANT, physicalQuantity: 3, committedQuantity: 0 },
      { id: "stock-secondary", warehouseId: SECONDARY_WAREHOUSE, variantId: VARIANT, physicalQuantity: 1000, committedQuantity: 0 },
    ];
    const tx = createFakeTx(fixtures);
    const warehouse = { id: DEFAULT_WAREHOUSE, storeId: STORE, companyId: COMPANY };
    const result = await call(tx, warehouse, saleLine({ quantity: 10 }), 10, "DELIVERY");
    expect(result).toEqual({ kind: "STOCK_INSUFFICIENT", sku: "SKU-1", available: 3, requested: 10 });
  });

  it("DELIVERY reports STOCK_INSUFFICIENT with the pooled available total across all active warehouses", async () => {
    const fixtures = baseFixtures();
    fixtures.inventoryStocks = [
      { id: "stock-default", warehouseId: DEFAULT_WAREHOUSE, variantId: VARIANT, physicalQuantity: 3, committedQuantity: 0 },
      { id: "stock-secondary", warehouseId: SECONDARY_WAREHOUSE, variantId: VARIANT, physicalQuantity: 4, committedQuantity: 0 },
    ];
    const tx = createFakeTx(fixtures);
    const warehouse = { id: DEFAULT_WAREHOUSE, storeId: STORE, companyId: COMPANY };
    const result = await call(tx, warehouse, saleLine({ quantity: 10 }), 10, "DELIVERY");
    expect(result).toEqual({ kind: "STOCK_INSUFFICIENT", sku: "SKU-1", available: 7, requested: 10 });
  });
});

describe("OrdersRepository#syncOffline (real logic, end to end against a fake tx)", () => {
  function repository(fixtures: Fixtures): OrdersRepository {
    const tx = createFakeTx(fixtures);
    const database = { db: { transaction: (cb: (tx: unknown) => unknown) => cb(tx) } };
    return new OrdersRepository(database as never);
  }

  const customerId = "40000000-0000-4000-8000-000000000001";

  it("fails with WAREHOUSE_NOT_FOUND when the requested warehouse does not exist", async () => {
    const r = repository(baseFixtures());
    const result = await r.syncOffline(
      customerId,
      {
        clientOperationId: "50000000-0000-4000-8000-000000000001",
        clientCreatedAt: "2026-09-09T01:00:00.000Z",
        sourceCartId: null,
        warehouseId: "nonexistent-id",
        fulfillmentType: "PICKUP",
        addressId: null,
        notes: null,
        items: [{ variantId: VARIANT, quantity: 1 }],
      } as never,
      [{ variantId: VARIANT, quantity: 1 }],
    );
    expect(result).toEqual({ kind: "WAREHOUSE_NOT_FOUND" });
  });

  it("fails with STORE_WAREHOUSE_INVALID when the requested warehouse is active but is not the store's default warehouse", async () => {
    const r = repository(baseFixtures());
    const result = await r.syncOffline(
      customerId,
      {
        clientOperationId: "50000000-0000-4000-8000-000000000002",
        clientCreatedAt: "2026-09-09T01:00:00.000Z",
        sourceCartId: null,
        warehouseId: SECONDARY_WAREHOUSE,
        fulfillmentType: "PICKUP",
        addressId: null,
        notes: null,
        items: [{ variantId: VARIANT, quantity: 1 }],
      } as never,
      [{ variantId: VARIANT, quantity: 1 }],
    );
    expect(result).toEqual({ kind: "STORE_WAREHOUSE_INVALID" });
  });

  it("PICKUP succeeds against the single requested warehouse", async () => {
    const fixtures = baseFixtures();
    fixtures.inventoryStocks = [{ id: "stock-default", warehouseId: DEFAULT_WAREHOUSE, variantId: VARIANT, physicalQuantity: 5, committedQuantity: 0 }];
    const r = repository(fixtures);
    const result = await r.syncOffline(
      customerId,
      {
        clientOperationId: "50000000-0000-4000-8000-000000000003",
        clientCreatedAt: "2026-09-09T01:00:00.000Z",
        sourceCartId: null,
        warehouseId: DEFAULT_WAREHOUSE,
        fulfillmentType: "PICKUP",
        addressId: null,
        notes: null,
        items: [{ variantId: VARIANT, quantity: 5 }],
      } as never,
      [{ variantId: VARIANT, quantity: 5 }],
    );
    expect(result).toMatchObject({ kind: "OK" });
  });

  it("DELIVERY succeeds by pooling stock across the store's active warehouses with a valid address", async () => {
    const fixtures = baseFixtures();
    fixtures.inventoryStocks = [
      { id: "stock-default", warehouseId: DEFAULT_WAREHOUSE, variantId: VARIANT, physicalQuantity: 3, committedQuantity: 0 },
      { id: "stock-secondary", warehouseId: SECONDARY_WAREHOUSE, variantId: VARIANT, physicalQuantity: 20, committedQuantity: 0 },
    ];
    const addressId = "70000000-0000-4000-8000-000000000001";
    fixtures.customerAddresses = [
      {
        id: addressId,
        userId: customerId,
        active: true,
        recipientName: "Cliente Test",
        recipientPhone: "70000000",
        department: "Santa Cruz",
        city: "Santa Cruz",
        zone: "Equipetrol",
        addressLine: "Calle Falsa 123",
        reference: null,
      },
    ];
    const r = repository(fixtures);
    const result = await r.syncOffline(
      customerId,
      {
        clientOperationId: "50000000-0000-4000-8000-000000000004",
        clientCreatedAt: "2026-09-09T01:00:00.000Z",
        sourceCartId: null,
        warehouseId: DEFAULT_WAREHOUSE,
        fulfillmentType: "DELIVERY",
        addressId,
        notes: null,
        items: [{ variantId: VARIANT, quantity: 10 }],
      } as never,
      [{ variantId: VARIANT, quantity: 10 }],
    );
    expect(result).toMatchObject({ kind: "OK" });
  });
});
