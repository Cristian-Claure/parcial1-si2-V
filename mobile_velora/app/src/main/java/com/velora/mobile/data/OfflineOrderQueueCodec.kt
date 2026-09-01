package com.velora.mobile.data

import org.json.JSONArray
import org.json.JSONObject

enum class MobileOfflineOrderQueueStatus {
    PENDING,
    SYNCING,
    CONFLICT
}

data class MobileOfflineOrderQueueEntry(
    val request:
        MobileOfflineOrderRequest,
    val status:
        MobileOfflineOrderQueueStatus,
    val conflictMessage:
        String? = null,
    val createdAt:
        String,
    val updatedAt:
        String
) {
    val clientOperationId:
        String
        get() =
            request.clientOperationId
}

class OfflineOrderQueueCodec {

    fun encode(
        entries:
            List<MobileOfflineOrderQueueEntry>
    ): String {

        val array =
            JSONArray()

        entries.forEach { entry ->
            array.put(
                encodeEntry(
                    entry
                )
            )
        }

        return array.toString()
    }

    fun decode(
        payload: String
    ): List<MobileOfflineOrderQueueEntry> {

        val array =
            JSONArray(
                payload
            )

        return buildList {

            for (
                index in
                0 until array.length()
            ) {
                add(
                    decodeEntry(
                        array.getJSONObject(
                            index
                        )
                    )
                )
            }
        }
    }

    private fun encodeEntry(
        entry:
            MobileOfflineOrderQueueEntry
    ): JSONObject {

        val request =
            entry.request

        val items =
            JSONArray()

        request.items
            .forEach { item ->

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

        val requestJson =
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
                    "sourceCartId",
                    request.sourceCartId
                        ?: JSONObject.NULL
                )
                .put(
                    "warehouseId",
                    request.warehouseId
                )
                .put(
                    "fulfillmentType",
                    request.fulfillmentType.name
                )
                .put(
                    "addressId",
                    request.addressId
                        ?: JSONObject.NULL
                )
                .put(
                    "notes",
                    request.notes
                        ?: JSONObject.NULL
                )
                .put(
                    "items",
                    items
                )

        return JSONObject()
            .put(
                "request",
                requestJson
            )
            .put(
                "status",
                entry.status.name
            )
            .put(
                "conflictMessage",
                entry.conflictMessage
                    ?: JSONObject.NULL
            )
            .put(
                "createdAt",
                entry.createdAt
            )
            .put(
                "updatedAt",
                entry.updatedAt
            )
    }

    private fun decodeEntry(
        json: JSONObject
    ): MobileOfflineOrderQueueEntry {

        val requestJson =
            json.getJSONObject(
                "request"
            )

        val itemsJson =
            requestJson.getJSONArray(
                "items"
            )

        val items =
            buildList {

                for (
                    index in
                    0 until itemsJson.length()
                ) {

                    val item =
                        itemsJson.getJSONObject(
                            index
                        )

                    add(
                        MobileOfflineOrderItemRequest(
                            variantId =
                                item.getString(
                                    "variantId"
                                ),
                            quantity =
                                item.getInt(
                                    "quantity"
                                )
                        )
                    )
                }
            }

        val request =
            MobileOfflineOrderRequest(
                clientOperationId =
                    requestJson.getString(
                        "clientOperationId"
                    ),

                clientCreatedAt =
                    requestJson.getString(
                        "clientCreatedAt"
                    ),

                sourceCartId =
                    nullableString(
                        requestJson,
                        "sourceCartId"
                    ),

                warehouseId =
                    requestJson.getString(
                        "warehouseId"
                    ),

                fulfillmentType =
                    MobileFulfillmentType.valueOf(
                        requestJson.getString(
                            "fulfillmentType"
                        )
                    ),

                addressId =
                    nullableString(
                        requestJson,
                        "addressId"
                    ),

                notes =
                    nullableString(
                        requestJson,
                        "notes"
                    ),

                items =
                    items
            )

        return MobileOfflineOrderQueueEntry(
            request =
                request,

            status =
                MobileOfflineOrderQueueStatus.valueOf(
                    json.getString(
                        "status"
                    )
                ),

            conflictMessage =
                nullableString(
                    json,
                    "conflictMessage"
                ),

            createdAt =
                json.getString(
                    "createdAt"
                ),

            updatedAt =
                json.getString(
                    "updatedAt"
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
            .optString(
                key
            )
            .takeIf {
                it.isNotBlank()
            }
    }
}