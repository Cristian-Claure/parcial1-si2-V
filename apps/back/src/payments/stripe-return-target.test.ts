import {
  describe,
  expect,
  it,
} from "vitest";

import {
  mobileStripeAppUrl,
  normalizeMobileReturnParam,
  stripeCheckoutRedirects,
} from "./stripe-return-target.js";

const config = {
  webSuccessUrl:
    "http://localhost:5173/pago/stripe/retorno",
  webCancelUrl:
    "http://localhost:5173/mis-pedidos",
  publicBackendUrl:
    "https://api.velora.example/",
};

describe(
  "stripe return target",
  () => {
    it(
      "preserves the existing Web redirect",
      () => {
        expect(
          stripeCheckoutRedirects(
            config,
            "WEB",
            "payment-1",
          ),
        ).toEqual({
          successBase:
            config.webSuccessUrl,
          cancelUrl:
            config.webCancelUrl,
        });
      },
    );

    it(
      "uses an HTTP(S) backend trampoline for Mobile",
      () => {
        expect(
          stripeCheckoutRedirects(
            config,
            "MOBILE",
            "pay 1",
          ),
        ).toEqual({
          successBase:
            "https://api.velora.example/api/payments/stripe/mobile/success",
          cancelUrl:
            "https://api.velora.example/api/payments/stripe/mobile/cancel?payment_id=pay%201",
        });
      },
    );

    it(
      "rejects non HTTP(S) public backend URLs",
      () => {
        expect(
          () =>
            stripeCheckoutRedirects(
              {
                ...config,
                publicBackendUrl:
                  "javascript:alert(1)",
              },
              "MOBILE",
              "payment-1",
            ),
        ).toThrow();
      },
    );

    it(
      "builds fixed VÉLORA app deep links without open redirects",
      () => {
        expect(
          mobileStripeAppUrl(
            "success",
            {
              sessionId:
                "cs_test_123",
              paymentId:
                "payment 1",
            },
          ),
        ).toBe(
          "velora://stripe-return?session_id=cs_test_123&payment_id=payment+1",
        );

        expect(
          mobileStripeAppUrl(
            "cancel",
            {
              paymentId:
                "payment-1",
            },
          ),
        ).toBe(
          "velora://orders?payment_id=payment-1&stripe=cancelled",
        );
      },
    );

    it(
      "drops malformed callback query values",
      () => {
        expect(
          normalizeMobileReturnParam(
            ["unexpected"],
          ),
        ).toBeNull();

        expect(
          normalizeMobileReturnParam(
            "  cs_123  ",
          ),
        ).toBe(
          "cs_123",
        );
      },
    );
  },
);
