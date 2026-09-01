package com.velora.mobile.data

import org.json.JSONArray
import org.json.JSONObject

data class MobileOfflineOrderItemRequest(
    val variantId: String,
    val quantity: Int
)

data class MobileOfflineOrderRequest(
    val clientOperationId: String,
    val clientCreatedAt: String,
    val sourceCartId: String?,
    val warehouseId: String,
    val fulfillmentType:
        MobileFulfillmentType,
    val addressId: String?,
    val notes: String?,
    val items:
        List<MobileOfflineOrderItemRequest>
)
enum class MobileFulfillmentType {
    DELIVERY,
    PICKUP,
    IN_STORE
}

enum class MobileOrderStatus {
    RESERVED,
    FULFILLED,
    CANCELLED
}

data class MobileOrderItem(
    val id: String,
    val variantId: String,
    val productName: String,
    val sku: String,
    val size: String,
    val color: String,
    val unitPrice: Double,
    val currency: String,
    val quantity: Int,
    val subtotal: Double
)

data class MobileOrder(
    val id: String,
    val orderNumber: String,

    val warehouseId: String,
    val storeId: String,
    val storeName: String,

    val fulfillmentType:
        MobileFulfillmentType,

    val status:
        MobileOrderStatus,

    val currency: String,
    val subtotal: Double,
    val total: Double,

    val recipientName: String?,
    val recipientPhone: String?,

    val department: String?,
    val city: String?,
    val zone: String?,

    val addressLine: String?,
    val addressReference: String?,

    val notes: String?,

    val createdAt: String,
    val cancelledAt: String?,
    val fulfilledAt: String?,

    val items: List<MobileOrderItem>
)

class OrderApi(
    private val client: ApiClient
) {
    fun syncOffline(
        request:
            MobileOfflineOrderRequest
    ): MobileOrder {

        require(
            request.clientOperationId
                .isNotBlank()
        ) {
            "clientOperationId es obligatorio."
        }

        require(
            request.clientCreatedAt
                .isNotBlank()
        ) {
            "clientCreatedAt es obligatorio."
        }

        require(
            request.warehouseId
                .isNotBlank()
        ) {
            "warehouseId es obligatorio."
        }

        require(
            request.items.isNotEmpty()
        ) {
            "El pedido offline debe contener al menos un producto."
        }

        require(
            request.fulfillmentType ==
                MobileFulfillmentType.DELIVERY ||
            request.fulfillmentType ==
                MobileFulfillmentType.PICKUP
        ) {
            "El pedido offline solo admite DELIVERY o PICKUP."
        }

        if (
            request.fulfillmentType ==
                MobileFulfillmentType.DELIVERY &&
            request.addressId
                .isNullOrBlank()
        ) {
            throw IllegalArgumentException(
                "La dirección es obligatoria para DELIVERY."
            )
        }

        val items =
            JSONArray()

        request.items
            .forEach { item ->

                require(
                    item.variantId
                        .isNotBlank()
                ) {
                    "variantId es obligatorio."
                }

                require(
                    item.quantity > 0
                ) {
                    "La cantidad debe ser mayor a cero."
                }

                items.put(
                    JSONObject()
                        .put(
                            "variantId",
                            item.variantId
                        )
                        .put(
                            "quantity",
                            item.quantity
                        )
                )
            }

        val body =
            JSONObject()
                .put(
                    "clientOperationId",
                    request.clientOperationId
                )
                .put(
                    "clientCreatedAt",
                    request.clientCreatedAt
                )
                .put(
                    "warehouseId",
                    request.warehouseId
                )
                .put(
                    "fulfillmentType",
                    request
                        .fulfillmentType
                        .name
                )
                .put(
                    "items",
                    items
                )

        if (
            request.sourceCartId
                .isNullOrBlank()
        ) {
            body.put(
                "sourceCartId",
                JSONObject.NULL
            )
        } else {
            body.put(
                "sourceCartId",
                request.sourceCartId
            )
        }

        if (
            request.fulfillmentType ==
                MobileFulfillmentType.DELIVERY
        ) {
            body.put(
                "addressId",
                request.addressId
            )
        } else {
            body.put(
                "addressId",
                JSONObject.NULL
            )
        }

        if (
            request.notes
                .isNullOrBlank()
        ) {
            body.put(
                "notes",
                JSONObject.NULL
            )
        } else {
            body.put(
                "notes",
                request.notes.trim()
            )
        }

        return parseOrder(
            client.postObject(
                "/customer/orders/offline-sync",
                body
            )
        )
    }

    fun create(
        warehouseId: String,
        fulfillmentType:
            MobileFulfillmentType,
        addressId: String?,
        notes: String?
    ): MobileOrder {

        require(
            fulfillmentType ==
                MobileFulfillmentType.DELIVERY ||
            fulfillmentType ==
                MobileFulfillmentType.PICKUP
        ) {
            "El checkout mobile solo admite DELIVERY o PICKUP."
        }

        if (
            fulfillmentType ==
                MobileFulfillmentType.DELIVERY &&
            addressId.isNullOrBlank()
        ) {
            throw IllegalArgumentException(
                "La dirección es obligatoria para DELIVERY."
            )
        }

        val body =
            JSONObject()
                .put(
                    "warehouseId",
                    warehouseId
                )
                .put(
                    "fulfillmentType",
                    fulfillmentType.name
                )

        if (
            fulfillmentType ==
                MobileFulfillmentType.DELIVERY
        ) {
            body.put(
                "addressId",
                addressId
            )
        } else {
            body.put(
                "addressId",
                JSONObject.NULL
            )
        }

        if (notes.isNullOrBlank()) {
            body.put(
                "notes",
                JSONObject.NULL
            )
        } else {
            body.put(
                "notes",
                notes.trim()
            )
        }

        return parseOrder(
            client.postObject(
                "/customer/orders",
                body
            )
        )
    }

    fun list():
        List<MobileOrder> {

        val array =
            client.getArray(
                "/customer/orders"
            )

        return buildList {

            for (
                index in
                0 until array.length()
            ) {
                add(
                    parseOrder(
                        array.getJSONObject(
                            index
                        )
                    )
                )
            }
        }
    }

    fun get(
        orderId: String
    ): MobileOrder {

        return parseOrder(
            client.getObject(
                "/customer/orders/$orderId"
            )
        )
    }

    fun cancel(
        orderId: String
    ): MobileOrder {

        return parseOrder(
            client.postObject(
                "/customer/orders/$orderId/cancel",
                JSONObject()
            )
        )
    }

    private fun parseOrder(
        json: JSONObject
    ): MobileOrder {

        val itemsJson =
            json.optJSONArray(
                "items"
            ) ?: JSONArray()

        val items =
            buildList {

                for (
                    index in
                    0 until itemsJson.length()
                ) {

                    val item =
                        itemsJson
                            .getJSONObject(
                                index
                            )

                    add(
                        MobileOrderItem(
                            id =
                                item.getString(
                                    "id"
                                ),

                            variantId =
                                item.getString(
                                    "variantId"
                                ),

                            productName =
                                item.getString(
                                    "productName"
                                ),

                            sku =
                                item.getString(
                                    "sku"
                                ),

                            size =
                                item.getString(
                                    "size"
                                ),

                            color =
                                item.getString(
                                    "color"
                                ),

                            unitPrice =
                                item.getDouble(
                                    "unitPrice"
                                ),

                            currency =
                                item.getString(
                                    "currency"
                                ),

                            quantity =
                                item.getInt(
                                    "quantity"
                                ),

                            subtotal =
                                item.getDouble(
                                    "subtotal"
                                )
                        )
                    )
                }
            }

        return MobileOrder(
            id =
                json.getString(
                    "id"
                ),

            orderNumber =
                json.getString(
                    "orderNumber"
                ),

            warehouseId =
                json.getString(
                    "warehouseId"
                ),

            storeId =
                json.getString(
                    "storeId"
                ),

            storeName =
                json.getString(
                    "storeName"
                ),

            fulfillmentType =
                MobileFulfillmentType.valueOf(
                    json.getString(
                        "fulfillmentType"
                    )
                ),

            status =
                MobileOrderStatus.valueOf(
                    json.getString(
                        "status"
                    )
                ),

            currency =
                json.getString(
                    "currency"
                ),

            subtotal =
                json.getDouble(
                    "subtotal"
                ),

            total =
                json.getDouble(
                    "total"
                ),

            recipientName =
                nullableString(
                    json,
                    "recipientName"
                ),

            recipientPhone =
                nullableString(
                    json,
                    "recipientPhone"
                ),

            department =
                nullableString(
                    json,
                    "department"
                ),

            city =
                nullableString(
                    json,
                    "city"
                ),

            zone =
                nullableString(
                    json,
                    "zone"
                ),

            addressLine =
                nullableString(
                    json,
                    "addressLine"
                ),

            addressReference =
                nullableString(
                    json,
                    "addressReference"
                ),

            notes =
                nullableString(
                    json,
                    "notes"
                ),

            createdAt =
                json.getString(
                    "createdAt"
                ),

            cancelledAt =
                nullableString(
                    json,
                    "cancelledAt"
                ),

            fulfilledAt =
                nullableString(
                    json,
                    "fulfilledAt"
                ),

            items = items
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