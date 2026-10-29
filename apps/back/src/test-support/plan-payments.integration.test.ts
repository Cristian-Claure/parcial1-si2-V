import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AdminPlanResponse, PlanPayment, PlanPaymentOptionsResponse, PlanPaymentResponse, PlatformBillingSettingsResponse, PlatformPayment, QrActionResponse } from "@velora/contracts";
import { createMigratedDatabase, integrationDatabaseAvailable, type TestDatabase } from "./integration-database.js";
import { http, insertUser, login, multipart, seedTenant, startTestApp, subscribe, TINY_PNG, type SeededTenant, type TestApp } from "./integration-app.js";

const available = await integrationDatabaseAvailable();
const WEBHOOK_SECRET = "whsec_test_doble_fase5";
const DAY_MS = 24 * 60 * 60 * 1000;
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "latin1");

/** Doble local de la API de Stripe: crea sesiones y devuelve el estado que fija la prueba. */
function stripeDouble() {
  const sessions = new Map<string, { payment_status: string; status: string; amount_total: number; currency: string }>();
  let counter = 0;
  const server: Server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      response.setHeader("Content-Type", "application/json");
      if (request.method === "POST" && request.url === "/v1/checkout/sessions") {
        const form = new URLSearchParams(body);
        counter += 1;
        const id = `cs_test_doble_${counter}`;
        sessions.set(id, { payment_status: "unpaid", status: "open", amount_total: Number(form.get("line_items[0][price_data][unit_amount]")), currency: form.get("line_items[0][price_data][currency]") ?? "" });
        response.end(JSON.stringify({ id, url: `https://checkout.stripe.test/${id}`, expires_at: Math.floor(Date.now() / 1000) + 1800 }));
        return;
      }
      if (request.method === "GET" && request.url === "/v1/balance") {
        response.end(JSON.stringify({ object: "balance" }));
        return;
      }
      const match = /^\/v1\/checkout\/sessions\/([^/?]+)/.exec(request.url ?? "");
      const session = match ? sessions.get(decodeURIComponent(match[1]!)) : undefined;
      if (request.method === "GET" && session) {
        response.end(JSON.stringify({ id: match![1], ...session }));
        return;
      }
      response.statusCode = 404;
      response.end("{}");
    });
  });
  return { server, sessions };
}

function signedWebhook(payload: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  return `t=${timestamp},v1=${createHmac("sha256", WEBHOOK_SECRET).update(`${timestamp}.${payload}`).digest("hex")}`;
}

describe.skipIf(!available)("Fase 5 · pagos de plan: QR, transferencia y Stripe (integración)", () => {
  let db: TestDatabase;
  let server: TestApp;
  let double: ReturnType<typeof stripeDouble>;
  let qrOwner: SeededTenant;
  let transferOwner: SeededTenant;
  let stripeOwner: SeededTenant;
  let other: SeededTenant;
  const tokens: Record<string, string> = {};

  const call = async <T>(token: string | undefined, method: string, path: string, body?: unknown) => {
    const result = await http<T>(server.baseUrl, method, path, { token, body });
    if (result.status >= 300) throw new Error(`${method} ${path} → ${result.status} ${result.text}`);
    return result.body;
  };
  const subscription = async (ownerId: string) =>
    (await db.query<{ code: string; status: string; current_period_end: Date | null }>(
      "select p.code, s.status, s.current_period_end from subscriptions s join plans p on p.id = s.plan_id where s.owner_user_id = $1 and s.status <> 'CANCELLED'", [ownerId]))[0]!;
  const uploadProof = (token: string, paymentId: string, file: { filename: string; contentType: string; data: Buffer }, operationNumber = "OP-123456") =>
    http<PlanPaymentResponse>(server.baseUrl, "POST", `/api/admin/plan/payments/${paymentId}/transfer-proof`, { token, raw: multipart({ operationNumber }, { name: "file", ...file }) });

  beforeAll(async () => {
    db = await createMigratedDatabase("planpay");
    double = stripeDouble();
    await new Promise<void>((resolve) => double.server.listen(0, "127.0.0.1", resolve));
    qrOwner = await seedTenant(db, "PQ");
    transferOwner = await seedTenant(db, "PT");
    stripeOwner = await seedTenant(db, "PS");
    other = await seedTenant(db, "PO", { planCode: "MAX" });
    await subscribe(db, qrOwner.ownerId, "PLUS", { periodEnd: new Date(Date.now() + 10 * DAY_MS) });
    await subscribe(db, transferOwner.ownerId, "MAX", { periodEnd: new Date(Date.now() + 10 * DAY_MS) });
    await subscribe(db, stripeOwner.ownerId, "PLUS", { periodEnd: new Date(Date.now() + 5 * DAY_MS) });
    await insertUser(db, { email: "plataforma-pagos@test.local", role: "PLATFORM_ADMIN" });
    server = await startTestApp(db, {
      VELORA_QR_PROVIDER: "DEMO", VELORA_QR_SIGNING_SECRET: "p".repeat(48), VELORA_PUBLIC_WEB_URL: "http://web.test",
      STRIPE_SECRET_KEY: "sk_test_dobleFase5abcdef", STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      VELORA_STRIPE_API_BASE_URL: `http://127.0.0.1:${(double.server.address() as AddressInfo).port}`,
    });
    for (const [key, email] of Object.entries({ qr: qrOwner.ownerEmail, transfer: transferOwner.ownerEmail, stripe: stripeOwner.ownerEmail, other: other.ownerEmail, manager: transferOwner.managerEmail, platform: "plataforma-pagos@test.local" })) {
      tokens[key] = await login(server.baseUrl, email);
    }
  });

  afterAll(async () => {
    await server?.close();
    await new Promise((resolve) => double?.server.close(resolve));
    await db?.drop();
  });

  it("ofrece los 3 métodos (Stripe habilitado con clave válida, QR DEMO y transferencia con datos de ejemplo)", async () => {
    const options = await call<PlanPaymentOptionsResponse>(tokens.qr, "GET", "/api/admin/plan/payment-options");
    expect(options.methods.map((method) => [method.method, method.enabled])).toEqual([["STRIPE", true], ["QR", true], ["TRANSFER", true]]);
    expect(options.qrProvider).toBe("DEMO");
    expect(options.transfer?.isSample).toBe(true);
    expect(options.transfer?.bankName).toContain("DATOS DE EJEMPLO");
  });

  it("QR: el plan cambia SOLO al pagar; monto del servidor; auditoría", async () => {
    const created = await call<PlanPaymentResponse>(tokens.qr, "POST", "/api/admin/plan/payments", { planCode: "MAX", method: "QR" });
    expect(created.payment).toMatchObject({ status: "PENDING", planCode: "MAX", amount: 249, method: "QR" });
    expect(created.qr?.amount).toBe(249);
    expect((await subscription(qrOwner.ownerId)).code).toBe("PLUS");

    const token = new URL(created.qr!.payUrl!).searchParams.get("t")!;
    const paid = await call<QrActionResponse>(undefined, "POST", `/api/pay/qr/${created.qr!.reference}/confirm`, { token });
    expect(paid.status).toBe("PAID");
    const after = await subscription(qrOwner.ownerId);
    expect(after.code).toBe("MAX");
    expect(after.status).toBe("ACTIVE");
    // Cambio de plan: el periodo empieza al pagar (30 días).
    expect(Math.round((after.current_period_end!.getTime() - Date.now()) / DAY_MS)).toBe(30);
    const audit = await db.query<{ route_pattern: string }>("select route_pattern from audit_events where category = 'BILLING' and actor_user_id = $1", [qrOwner.ownerId]);
    expect(audit.map((row) => row.route_pattern)).toEqual(["billing:plan-activated:MAX:QR"]);

    // Renovación anticipada del mismo plan: suma 30 días desde el vencimiento.
    const renewal = await call<PlanPaymentResponse>(tokens.qr, "POST", "/api/admin/plan/payments", { planCode: "MAX", method: "QR" });
    await call(undefined, "POST", `/api/pay/qr/${renewal.qr!.reference}/confirm`, { token: new URL(renewal.qr!.payUrl!).searchParams.get("t")! });
    const renewed = await subscription(qrOwner.ownerId);
    expect(renewed.current_period_end!.getTime() - after.current_period_end!.getTime()).toBe(30 * DAY_MS);

    const history = await call<PlanPayment[]>(tokens.qr, "GET", "/api/admin/plan/payments");
    expect(history.filter((payment) => payment.status === "PAID")).toHaveLength(2);
    const receipt = await http(server.baseUrl, "GET", `/api/admin/plan/payments/${created.payment.id}/receipt`, { token: tokens.qr });
    expect(receipt.status).toBe(200);
    expect(receipt.text.startsWith("%PDF")).toBe(true);
  });

  it("transferencia: valida el archivo, revisión con rechazo y reenvío, aprobación activa el plan", async () => {
    const created = await call<PlanPaymentResponse>(tokens.transfer, "POST", "/api/admin/plan/payments", { planCode: "MAX", method: "TRANSFER" });
    expect(created.payment.reference).toMatch(/^TRM\d{12}$/);
    expect(created.transfer?.accountNumber).toBeTruthy();
    const before = await subscription(transferOwner.ownerId);

    // Tipo real por firma: un texto con extensión .png se rechaza; más de 5 MB también.
    expect((await uploadProof(tokens.transfer!, created.payment.id, { filename: "falso.png", contentType: "image/png", data: Buffer.from("no soy una imagen") })).status).toBe(415);
    expect((await uploadProof(tokens.transfer!, created.payment.id, { filename: "grande.pdf", contentType: "application/pdf", data: Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]) })).status).toBe(413);
    const sent = await uploadProof(tokens.transfer!, created.payment.id, { filename: "comprobante.pdf", contentType: "application/pdf", data: PDF });
    expect(sent.status).toBe(200);
    expect(sent.body.payment.status).toBe("PENDING_REVIEW");
    expect((await http(server.baseUrl, "POST", "/api/admin/plan/payments", { token: tokens.transfer, body: { planCode: "MAX", method: "QR" } })).status).toBe(409);

    // Comprobante privado: dueño y plataforma sí; otro propietario 404; encargado 403; sin sesión 401.
    expect((await http(server.baseUrl, "GET", `/api/billing/payments/${created.payment.id}/proof`, { token: tokens.transfer })).status).toBe(200);
    expect((await http(server.baseUrl, "GET", `/api/billing/payments/${created.payment.id}/proof`, { token: tokens.platform })).status).toBe(200);
    expect((await http(server.baseUrl, "GET", `/api/billing/payments/${created.payment.id}/proof`, { token: tokens.other })).status).toBe(404);
    expect((await http(server.baseUrl, "GET", `/api/billing/payments/${created.payment.id}/proof`, { token: tokens.manager })).status).toBe(403);
    expect((await http(server.baseUrl, "GET", `/api/billing/payments/${created.payment.id}/proof`)).status).toBe(401);

    const queue = await call<PlatformPayment[]>(tokens.platform, "GET", "/api/platform/payments?status=PENDING_REVIEW");
    expect(queue.map((payment) => payment.id)).toContain(created.payment.id);
    expect(queue.find((payment) => payment.id === created.payment.id)?.ownerEmail).toBe(transferOwner.ownerEmail);
    expect((await http(server.baseUrl, "GET", "/api/platform/payments", { token: tokens.transfer })).status).toBe(403);

    expect((await http(server.baseUrl, "POST", `/api/platform/payments/${created.payment.id}/review`, { token: tokens.platform, body: { decision: "REJECT" } })).status).toBe(400);
    const rejected = await call<PlatformPayment>(tokens.platform, "POST", `/api/platform/payments/${created.payment.id}/review`, { decision: "REJECT", reason: "El monto no coincide" });
    expect(rejected.status).toBe("PENDING");
    const seen = await call<PlanPaymentResponse>(tokens.transfer, "GET", `/api/admin/plan/payments/${created.payment.id}`);
    expect(seen.payment.rejectionReason).toBe("El monto no coincide");
    expect((await subscription(transferOwner.ownerId)).current_period_end).toEqual(before.current_period_end);

    const resent = await uploadProof(tokens.transfer!, created.payment.id, { filename: "comprobante.png", contentType: "image/png", data: TINY_PNG }, "OP-999");
    expect(resent.body.payment.status).toBe("PENDING_REVIEW");
    const approved = await call<PlatformPayment>(tokens.platform, "POST", `/api/platform/payments/${created.payment.id}/review`, { decision: "APPROVE" });
    expect(approved.status).toBe("PAID");
    expect(approved.proofs.map((proof) => proof.decision)).toEqual(["APPROVED", "REJECTED"]);
    const after = await subscription(transferOwner.ownerId);
    expect(after.current_period_end!.getTime() - before.current_period_end!.getTime()).toBe(30 * DAY_MS);
    expect((await http(server.baseUrl, "POST", `/api/platform/payments/${created.payment.id}/review`, { token: tokens.platform, body: { decision: "APPROVE" } })).status).toBe(409);
  });

  it("Stripe (doble): revalida contra la API; monto alterado no activa; webhook firmado idempotente", async () => {
    const created = await call<PlanPaymentResponse>(tokens.stripe, "POST", "/api/admin/plan/payments", { planCode: "MAX", method: "STRIPE" });
    expect(created.checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    expect(created.payment.provider).toBe("STRIPE");
    const sessionId = [...double.sessions.keys()].at(-1)!;
    expect(double.sessions.get(sessionId)).toMatchObject({ amount_total: 24900, currency: "bob" });

    // Consulta mientras está sin pagar → sigue PENDING y el plan no cambia.
    expect((await call<PlanPaymentResponse>(tokens.stripe, "GET", `/api/admin/plan/payments/${created.payment.id}`)).payment.status).toBe("PENDING");
    expect((await subscription(stripeOwner.ownerId)).code).toBe("PLUS");

    // Webhook firmado pero Stripe informa otro monto → no se activa.
    double.sessions.set(sessionId, { ...double.sessions.get(sessionId)!, payment_status: "paid", status: "complete", amount_total: 100 });
    const payload = JSON.stringify({ type: "checkout.session.completed", data: { object: { id: sessionId, payment_status: "paid" } } });
    expect((await http(server.baseUrl, "POST", "/api/payments/stripe/webhook", { raw: { contentType: "application/json", data: Buffer.from(payload) }, headers: { "stripe-signature": signedWebhook(payload) } })).status).toBe(204);
    expect((await subscription(stripeOwner.ownerId)).code).toBe("PLUS");

    // Firma inválida → 400.
    expect((await http(server.baseUrl, "POST", "/api/payments/stripe/webhook", { raw: { contentType: "application/json", data: Buffer.from(payload) }, headers: { "stripe-signature": "t=1,v1=00" } })).status).toBe(400);

    // Monto correcto → PAID y plan MAX; el segundo aviso no duplica nada.
    double.sessions.set(sessionId, { ...double.sessions.get(sessionId)!, amount_total: 24900 });
    for (let i = 0; i < 2; i += 1) {
      expect((await http(server.baseUrl, "POST", "/api/payments/stripe/webhook", { raw: { contentType: "application/json", data: Buffer.from(payload) }, headers: { "stripe-signature": signedWebhook(payload) } })).status).toBe(204);
    }
    expect((await subscription(stripeOwner.ownerId)).code).toBe("MAX");
    const history = await db.query<{ to_status: string }>("select to_status from payment_status_history where payment_id = $1 order by created_at", [created.payment.id]);
    expect(history.map((row) => row.to_status)).toEqual(["PENDING", "PAID"]);
    const plan = await call<AdminPlanResponse>(tokens.stripe, "GET", "/api/admin/plan");
    expect(plan.effectivePlan.code).toBe("MAX");
  });

  it("datos de cobro: solo PLATFORM_ADMIN los edita; al guardarlos dejan de ser de ejemplo; QR estático público", async () => {
    expect((await http(server.baseUrl, "GET", "/api/platform/billing-settings", { token: tokens.transfer })).status).toBe(403);
    const saved = await call<PlatformBillingSettingsResponse>(tokens.platform, "PUT", "/api/platform/billing-settings", {
      bankName: "Banco Uno", accountHolder: "Trama SRL", accountType: "Cuenta corriente", accountNumber: "1234567890", taxId: null, instructions: "Glosa obligatoria.",
    });
    expect(saved.isSample).toBe(false);
    const withQr = await http<PlatformBillingSettingsResponse>(server.baseUrl, "POST", "/api/platform/billing-settings/qr-image", {
      token: tokens.platform, raw: multipart({}, { name: "file", filename: "qr.png", contentType: "image/png", data: TINY_PNG }),
    });
    expect(withQr.status).toBe(200);
    expect(withQr.body.qrImageUrl).toMatch(/^\/api\/billing\/transfer-qr\//);
    expect((await http(server.baseUrl, "GET", withQr.body.qrImageUrl!)).status).toBe(200);
    expect((await http(server.baseUrl, "GET", "/api/billing/transfer-qr/00000000-0000-0000-0000-000000000000.png")).status).toBe(404);
  });
});
