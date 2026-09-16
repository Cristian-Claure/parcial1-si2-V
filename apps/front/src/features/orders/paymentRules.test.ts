import { describe, expect, it } from "vitest";
import { paymentMethodsForOrder } from "./paymentRules";
describe("paymentMethodsForOrder", () => {
  it("permite COD pero no CASH para DELIVERY", () => { const methods = paymentMethodsForOrder({ fulfillmentType: "DELIVERY" }); expect(methods).toContain("COD"); expect(methods).not.toContain("CASH"); });
  it("permite CASH pero no COD para PICKUP", () => { const methods = paymentMethodsForOrder({ fulfillmentType: "PICKUP" }); expect(methods).toContain("CASH"); expect(methods).not.toContain("COD"); });
});
