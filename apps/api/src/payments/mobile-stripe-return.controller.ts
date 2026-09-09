import {
  Controller,
  Get,
  Query,
  Redirect,
} from "@nestjs/common";

import {
  mobileStripeAppUrl,
  normalizeMobileReturnParam,
} from "./stripe-return-target.js";

@Controller(
  "api/payments/stripe/mobile",
)
export class MobileStripeReturnController {
  @Get(
    "success",
  )
  @Redirect(
    "velora://stripe-return",
    302,
  )
  success(
    @Query(
      "session_id",
    )
    sessionId:
      unknown,

    @Query(
      "payment_id",
    )
    paymentId:
      unknown,
  ): {
    url: string;
  } {
    return {
      url:
        mobileStripeAppUrl(
          "success",
          {
            sessionId:
              normalizeMobileReturnParam(
                sessionId,
              ),
            paymentId:
              normalizeMobileReturnParam(
                paymentId,
              ),
          },
        ),
    };
  }

  @Get(
    "cancel",
  )
  @Redirect(
    "velora://orders",
    302,
  )
  cancel(
    @Query(
      "payment_id",
    )
    paymentId:
      unknown,
  ): {
    url: string;
  } {
    return {
      url:
        mobileStripeAppUrl(
          "cancel",
          {
            paymentId:
              normalizeMobileReturnParam(
                paymentId,
              ),
          },
        ),
    };
  }
}
