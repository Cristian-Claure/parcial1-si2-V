import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CustomerQrPaymentResponse, PublicQrCharge, QrActionResponse, QrCharge, ReportOverview } from "@velora/contracts";
import { hashToken } from "../billing/qr-charge.service.js";
import { signDemoToken } from "../billing/qr/qr-gateway.js";
import { createMigratedDatabase, integrationDatabaseAvailable, type TestDatabase } from "./integration-database.js";
import { http, insertUser, login, seedTenant, startTestApp, type SeededTenant, type TestApp } from "./integration-app.js";

const available = await integrationDatabaseAvailable();
const SECRET = "q".repeat(48);

describe.skipIf(!available)("Fase 5 · pago QR DEMO de pedidos (integración)", () => {
  let db: TestDatabase;
  let server: TestApp;
  let shop: SeededTenant;
  const tokens: Record<string, string> = {};

  const call = async <T>(token: string | undefined, method: string, path: string, body?: unknown, headers?: Record<string, string>) => {
    const result = await http<T>(server.baseUrl, method, path, { token, body, headers });
    if (result.status >= 300) throw new Error(`${method} ${path} → ${result.status} ${result.text}`);
    return result.body;
  };
  const tokenOf = (payUrl: string | null) => new URL(payUrl!).searchParams.get("t")!;

  async function newOrder(customer = tokens.customer!): Promise<{ id: string; total: number }> {
    await call(customer, "POST", "/api/customer/cart/items", { companyId: shop.companyId, variantId: shop.variantId, quantity: 2 });
    return call(customer, "POST", "/api/customer/orders", { companyId: shop.companyId, warehouseId: shop.warehouseId, fulfillmentType: "PICKUP" }, { "Idempotency-Key": randomUUID() });
  }

  beforeAll(async () => {
    db = await createMigratedDatabase("qr");
    shop = await seedTenant(db, "Q", { planCode: "MAX" });
    await insertUser(db, { email: "cliente-qr@test.local", role: "CUSTOMER" });
    await insertUser(db, { email: "otro-qr@test.local", role: "CUSTOMER" });
    server = await startTestApp(db, { VELORA_QR_PROVIDER: "DEMO", VELORA_QR_SIGNING_SECRET: SECRET, VELORA_PUBLIC_WEB_URL: "http://web.test" });
    tokens.customer = await login(server.baseUrl, "cliente-qr@test.local");
    tokens.other = await login(server.baseUrl, "otro-qr@test.local");
    tokens.owner = await login(server.baseUrl, shop.ownerEmail);
  });

  afterAll(async () => {
    await server?.close();
    await db?.drop();
  });

  it("genera el QR con el monto del servidor, firma HMAC y token que solo se guarda como hash", async () => {
    const order = await newOrder();
    const created = await call<CustomerQrPaymentResponse>(tokens.customer, "POST", `/api/customer/orders/${order.id}/payments/qr`);
    expect(created.payment.method).toBe("QR");
    expect(created.qr.status).toBe("PENDING");
    expect(created.qr.amount).toBe(Number(order.total));
    expect(created.qr.demo).toBe(true);
    expect(created.qr.reference).toMatch(/^\d{14}$/);
    expect(created.qr.payUrl).toMatch(new RegExp(`^http://web\\.test/pagar/qr/${created.qr.reference}\\?t=`));
    expect(created.qr.qrSvg).toMatch(/^<svg/);
    expect(created.qr.qrPngDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(created.qr.secondsRemaining).toBeGreaterThan(590);
    const token = tokenOf(created.qr.payUrl);
    const rows = await db.query<Record<string, unknown>>("select * from qr_charges where payment_id = $1", [created.payment.id]);
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(rows[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);

    // Idempotente: un segundo intento devuelve el mismo QR vigente.
    const again = await call<CustomerQrPaymentResponse>(tokens.customer, "POST", `/api/customer/orders/${order.id}/payments/qr`);
    expect(again.qr.reference).toBe(created.qr.reference);
  });

  it("Banco demo: token inválido 403, monto alterado 403, confirmación idempotente y token de un solo uso", async () => {
    const order = await newOrder();
    const { qr, payment } = await call<CustomerQrPaymentResponse>(tokens.customer, "POST", `/api/customer/orders/${order.id}/payments/qr`);
    const token = tokenOf(qr.payUrl);
    const view = await call<PublicQrCharge>(undefined, "GET", `/api/pay/qr/${qr.reference}?t=${token}`);
    expect(view).toMatchObject({ status: "PENDING", amount: qr.amount, demo: true, merchantName: "Compania Q" });
    expect((await http(server.baseUrl, "GET", `/api/pay/qr/${qr.reference}?t=${token.slice(0, -2)}xx`)).status).toBe(403);
    expect((await http(server.baseUrl, "POST", `/api/pay/qr/${qr.reference}/confirm`, { body: { token: "a".repeat(43) } })).status).toBe(403);

    // Monto inmutable: si alguien cambia el monto en la BD, la firma deja de coincidir.
    await db.query("update qr_charges set amount = 1 where payment_id = $1", [payment.id]);
    expect((await http(server.baseUrl, "POST", `/api/pay/qr/${qr.reference}/confirm`, { body: { token } })).status).toBe(403);
    await db.query("update qr_charges set amount = $2 where payment_id = $1", [payment.id, qr.amount]);

    const first = await call<QrActionResponse>(undefined, "POST", `/api/pay/qr/${qr.reference}/confirm`, { token });
    expect(first).toEqual({ reference: qr.reference, status: "PAID", alreadyProcessed: false });
    const second = await call<QrActionResponse>(undefined, "POST", `/api/pay/qr/${qr.reference}/confirm`, { token });
    expect(second.alreadyProcessed).toBe(true);
    expect((await http(server.baseUrl, "POST", `/api/pay/qr/${qr.reference}/cancel`, { body: { token } })).status).toBe(409);

    const status = await call<QrCharge>(tokens.customer, "GET", `/api/customer/payments/${payment.id}/qr`);
    expect(status.status).toBe("PAID");
    expect(status.qrSvg).toBeNull();
    const history = await db.query<{ to_status: string }>("select to_status from payment_status_history where payment_id = $1 order by created_at", [payment.id]);
    expect(history.map((row) => row.to_status)).toEqual(["PENDING", "PAID"]);
  });

  it("vence a los 10 minutos de forma perezosa: el cliente ve EXPIRED y el banco responde 410", async () => {
    // Simula un QR emitido hace 11 minutos (el token firmado sigue siendo el mismo).
    const expire = async (paymentId: string): Promise<string> => {
      const row = (await db.query<{ id: string; reference: string; amount: string; currency: string; token_hash: string }>("select id, reference, amount, currency, token_hash from qr_charges where payment_id = $1", [paymentId]))[0]!;
      const token = signDemoToken(SECRET, { chargeId: row.id, reference: row.reference, amount: row.amount, currency: row.currency });
      expect(hashToken(token)).toBe(row.token_hash);
      await db.query("update qr_charges set expires_at = now() - interval '1 minute' where payment_id = $1", [paymentId]);
      return token;
    };
    const order = await newOrder();
    const first = await call<CustomerQrPaymentResponse>(tokens.customer, "POST", `/api/customer/orders/${order.id}/payments/qr`);
    await expire(first.payment.id);
    const view = await call<QrCharge>(tokens.customer, "GET", `/api/customer/payments/${first.payment.id}/qr`);
    expect(view.status).toBe("EXPIRED");
    expect(view.secondsRemaining).toBe(0);

    // Un QR nuevo para el mismo pedido; si vence sin que nadie lo consulte, el banco responde 410 y lo marca EXPIRED.
    const fresh = await call<CustomerQrPaymentResponse>(tokens.customer, "POST", `/api/customer/orders/${order.id}/payments/qr`);
    expect(fresh.qr.reference).not.toBe(first.qr.reference);
    const token = await expire(fresh.payment.id);
    expect((await http(server.baseUrl, "POST", `/api/pay/qr/${fresh.qr.reference}/confirm`, { body: { token } })).status).toBe(410);
    expect((await db.query<{ status: string }>("select status from payments where id = $1", [fresh.payment.id]))[0]!.status).toBe("EXPIRED");
  });

  it("aislamiento: otro cliente no ve ni crea el QR de un pedido ajeno", async () => {
    const order = await newOrder();
    const { payment } = await call<CustomerQrPaymentResponse>(tokens.customer, "POST", `/api/customer/orders/${order.id}/payments/qr`);
    expect((await http(server.baseUrl, "GET", `/api/customer/payments/${payment.id}/qr`, { token: tokens.other })).status).toBe(404);
    expect((await http(server.baseUrl, "POST", `/api/customer/orders/${order.id}/payments/qr`, { token: tokens.other })).status).toBe(404);
  });

  it("los cobros QR confirmados aparecen en el reporte por método de pago", async () => {
    // Fecha de negocio (America/La_Paz), no UTC: cerca de medianoche difieren.
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz" }).format(new Date());
    const overview = await call<ReportOverview>(tokens.owner, "GET", `/api/admin/reports/overview?companyId=${shop.companyId}&from=${today}&to=${today}`);
    const chart = overview.charts.find((entry) => entry.id === "payments-method");
    expect(chart?.categories).toContain("QR");
  });

  it("limita los intentos por IP en el Banco demo (429)", async () => {
    let limited = false;
    for (let i = 0; i < 40 && !limited; i += 1) {
      const result = await http(server.baseUrl, "GET", `/api/pay/qr/26102900000000?t=${"b".repeat(43)}`);
      limited = result.status === 429;
    }
    expect(limited).toBe(true);
  });
});
