package com.velora.mobile.data

import org.json.JSONObject

enum class MobilePaymentMethod {
    COD,
    CASH,
    CARD,
    WEB,
    QR
}

enum class MobilePaymentStatus {
    PENDING,
    PAID,
    FAILED,
    CANCELLED,
    REFUNDED
}

data class MobilePayment(
    val id: String,
    val orderId: String,
    val orderNumber: String,

    val storeId: String,
    val storeName: String,

    val method:
        MobilePaymentMethod,

    val status:
        MobilePaymentStatus,

    val amount: Double,
    val currency: String,

    val provider: String?,
    val externalReference: String?,
    val notes: String?,

    val processedById: String?,
    val processedByName: String?,

    val createdAt: String,
    val paidAt: String?,
    val failedAt: String?,
    val cancelledAt: String?,
    val refundedAt: String?
)

data class MobileOnlinePaymentIntent(
    val payment:
        MobilePayment,

    val qrPayload:
        String?,

    val expiresAt:
        String?
)

class PaymentApi(
    private val client: ApiClient
) {

    fun createOnlineIntent(
        orderId: String,
        method: MobilePaymentMethod,
        cardToken: String? = null,
        cardBrand: String? = null,
        cardLast4: String? = null,
        notes: String? = null
    ): MobileOnlinePaymentIntent {

        require(
            method ==
                MobilePaymentMethod.CARD ||
            method ==
                MobilePaymentMethod.QR
        ) {
            "El pago online mobile solo admite CARD o QR."
        }

        if (
            method ==
                MobilePaymentMethod.CARD &&
            cardToken.isNullOrBlank()
        ) {
            throw IllegalArgumentException(
                "El token temporal de tarjeta es obligatorio."
            )
        }

        val body =
            JSONObject()
                .put(
                    "method",
                    method.name
                )

        if (
            method ==
                MobilePaymentMethod.CARD
        ) {
            body.put(
                "cardToken",
                cardToken
            )

            body.put(
                "cardBrand",
                cardBrand
                    ?.takeIf {
                        it.isNotBlank()
                    }
                    ?: JSONObject.NULL
            )

            body.put(
                "cardLast4",
                cardLast4
                    ?.takeIf {
                        it.isNotBlank()
                    }
                    ?: JSONObject.NULL
            )

        } else {

            body.put(
                "cardToken",
                JSONObject.NULL
            )

            body.put(
                "cardBrand",
                JSONObject.NULL
            )

            body.put(
                "cardLast4",
                JSONObject.NULL
            )
        }

        body.put(
            "notes",
            notes
                ?.trim()
                ?.takeIf {
                    it.isNotEmpty()
                }
                ?: JSONObject.NULL
        )

        return parseIntent(
            client.postObject(
                "/customer/orders/$orderId/payments/online-intent",
                body
            )
        )
    }

    fun getOnlineIntent(
        paymentId: String
    ): MobileOnlinePaymentIntent {

        return parseIntent(
            client.getObject(
                "/customer/payments/$paymentId/online-intent"
            )
        )
    }

    fun confirmOnlineSandbox(
        paymentId: String
    ): MobilePayment {

        return parsePayment(
            client.postObject(
                "/customer/payments/$paymentId/sandbox-confirm",
                JSONObject()
            )
        )
    }

    fun get(
        paymentId: String
    ): MobilePayment {

        return parsePayment(
            client.getObject(
                "/customer/payments/$paymentId"
            )
        )
    }

    fun cancel(
        paymentId: String,
        reason: String?
    ): MobilePayment {

        val body =
            JSONObject()
                .put(
                    "reason",
                    reason
                        ?.trim()
                        ?.takeIf {
                            it.isNotEmpty()
                        }
                        ?: JSONObject.NULL
                )

        return parsePayment(
            client.postObject(
                "/customer/payments/$paymentId/cancel",
                body
            )
        )
    }

    private fun parseIntent(
        json: JSONObject
    ): MobileOnlinePaymentIntent {

        return MobileOnlinePaymentIntent(
            payment =
                parsePayment(
                    json.getJSONObject(
                        "payment"
                    )
                ),

            qrPayload =
                nullableString(
                    json,
                    "qrPayload"
                ),

            expiresAt =
                nullableString(
                    json,
                    "expiresAt"
                )
        )
    }

    private fun parsePayment(
        json: JSONObject
    ): MobilePayment {

        return MobilePayment(
            id =
                json.getString(
                    "id"
                ),

            orderId =
                json.getString(
                    "orderId"
                ),

            orderNumber =
                json.getString(
                    "orderNumber"
                ),

            storeId =
                json.getString(
                    "storeId"
                ),

            storeName =
                json.getString(
                    "storeName"
                ),

            method =
                MobilePaymentMethod.valueOf(
                    json.getString(
                        "method"
                    )
                ),

            status =
                MobilePaymentStatus.valueOf(
                    json.getString(
                        "status"
                    )
                ),

            amount =
                json.getDouble(
                    "amount"
                ),

            currency =
                json.getString(
                    "currency"
                ),

            provider =
                nullableString(
                    json,
                    "provider"
                ),

            externalReference =
                nullableString(
                    json,
                    "externalReference"
                ),

            notes =
                nullableString(
                    json,
                    "notes"
                ),

            processedById =
                nullableString(
                    json,
                    "processedById"
                ),

            processedByName =
                nullableString(
                    json,
                    "processedByName"
                ),

            createdAt =
                json.getString(
                    "createdAt"
                ),

            paidAt =
                nullableString(
                    json,
                    "paidAt"
                ),

            failedAt =
                nullableString(
                    json,
                    "failedAt"
                ),

            cancelledAt =
                nullableString(
                    json,
                    "cancelledAt"
                ),

            refundedAt =
                nullableString(
                    json,
                    "refundedAt"
                )
        )
    }

    private fun nullableString(
        json: JSONObject,
        key: String
    ): String? {

        if (
            !json.has(key) ||
            json.isNull(key)
        ) {
            return null
        }

        return json
            .optString(key)
            .takeIf {
                it.isNotBlank()
            }
    }
}