import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BankQrGateway, type BankQrApiSpec } from "./bank-qr.gateway.js";
import type { QrRemoteStatus } from "./qr-gateway.js";

/**
 * El servidor y el spec de esta prueba son un CONTRATO DE PRUEBA propio (no el del banco): sirven para
 * verificar la mecánica del adaptador (credenciales, encabezados, mapeo, errores y tiempos de espera).
 * El spec real se escribirá solo con la documentación oficial (docs/bank-api/FALTA.md).
 */
const TEST_SPEC: BankQrApiSpec = {
  async authorize(http, credentials) {
    const result = await http.request<{ token: string }>("POST", "/test/token", { body: credentials });
    return { Authorization: `Bearer ${result.body.token}` };
  },
  async createCharge(http, headers, charge) {
    const result = await http.request<{ id: string; qr: string }>("POST", "/test/charges", { headers, body: { reference: charge.reference, amount: charge.amount, currency: charge.currency } });
    return { providerChargeId: result.body.id, providerQrPayload: result.body.qr };
  },
  async queryStatus(http, headers, providerChargeId) {
    const result = await http.request<{ status: QrRemoteStatus }>("GET", `/test/charges/${providerChargeId}`, { headers });
    return result.body.status;
  },
};

describe("adaptador QR bancario (esqueleto) contra un servidor simulado", () => {
  let server: Server;
  let baseUrl: string;
  const statuses = new Map<string, QrRemoteStatus>();
  const seenAuth: string[] = [];
  let slow = false;

  beforeAll(async () => {
    server = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        if (slow) return; // nunca responde → tiempo de espera
        response.setHeader("Content-Type", "application/json");
        if (request.url === "/test/token") {
          const credentials = JSON.parse(body) as { clientId: string; clientSecret: string };
          response.end(JSON.stringify({ token: `tok-${credentials.clientId}` }));
          return;
        }
        seenAuth.push(String(request.headers.authorization));
        if (request.method === "POST" && request.url === "/test/charges") {
          const input = JSON.parse(body) as { reference: string };
          statuses.set(`ch_${input.reference}`, "PENDING");
          response.end(JSON.stringify({ id: `ch_${input.reference}`, qr: `000201BANCO${input.reference}` }));
          return;
        }
        const id = request.url?.split("/").pop() ?? "";
        response.end(JSON.stringify({ status: statuses.get(id) ?? "FAILED" }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  const charge = { chargeId: "c1", reference: "26102911112222", amount: "249.00", currency: "BOB", expiresAt: new Date(Date.now() + 600_000), description: "Plan Max" };

  it("sin documentación oficial no está listo y responde 503 QR_PROVIDER_NOT_READY", async () => {
    const gateway = new BankQrGateway("OPENBCB", { baseUrl, clientId: "id", clientSecret: "secreto" });
    expect(gateway.readiness()).toEqual({ ready: false, reason: expect.stringContaining("documentación oficial") });
    await expect(gateway.createCharge(charge)).rejects.toMatchObject({ status: 503 });
  });

  it("sin credenciales tampoco está listo (aunque exista el spec)", () => {
    const gateway = new BankQrGateway("BCP", { baseUrl }, TEST_SPEC);
    expect(gateway.readiness().reason).toContain("VELORA_QR_CLIENT_ID");
  });

  it("crea el cargo, usa la autorización y consulta el estado hasta PAID", async () => {
    const gateway = new BankQrGateway("OPENBCB", { baseUrl, clientId: "velora", clientSecret: "s" }, TEST_SPEC);
    const created = await gateway.createCharge(charge);
    expect(created).toEqual({ providerChargeId: "ch_26102911112222", providerQrPayload: "000201BANCO26102911112222" });
    expect(gateway.qrText(charge, created.providerQrPayload)).toBe("000201BANCO26102911112222");
    expect(await gateway.queryStatus(created.providerChargeId!)).toBe("PENDING");
    statuses.set(created.providerChargeId!, "PAID");
    expect(await gateway.queryStatus(created.providerChargeId!)).toBe("PAID");
    expect(seenAuth.every((value) => value === "Bearer tok-velora")).toBe(true);
    await expect(gateway.refund(created.providerChargeId, "249.00")).rejects.toMatchObject({ status: 501 });
  });

  it("un banco que no responde se traduce en 502 por tiempo de espera", async () => {
    slow = true;
    try {
      const gateway = new BankQrGateway("OPENBCB", { baseUrl, clientId: "velora", clientSecret: "s", timeoutMs: 200 }, TEST_SPEC);
      await expect(gateway.queryStatus("ch_x")).rejects.toMatchObject({ status: 502 });
    } finally {
      slow = false;
    }
  });
});
