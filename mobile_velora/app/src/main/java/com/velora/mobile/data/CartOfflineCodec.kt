package com.velora.mobile.data

import org.json.JSONArray
import org.json.JSONObject

class CartOfflineCodec {

    fun encode(
        cart: MobileCart
    ): String {

        val items =
            JSONArray()

        cart.items.forEach { item ->

            items.put(
                JSONObject()
                    .put(
                        "id",
                        item.id
                    )
                    .put(
                        "variantId",
                        item.variantId
                    )
                    .put(
                        "productId",
                        item.productId
                    )
                    .put(
                        "productName",
                        item.productName
                    )
                    .put(
                        "sku",
                        item.sku
                    )
                    .put(
                        "size",
                        item.size
                    )
                    .put(
                        "color",
                        item.color
                    )
                    .put(
                        "colorHex",
                        item.colorHex
                            ?: JSONObject.NULL
                    )
                    .put(
                        "unitPrice",
                        item.unitPrice
                    )
                    .put(
                        "currency",
                        item.currency
                    )
                    .put(
                        "quantity",
                        item.quantity
                    )
                    .put(
                        "subtotal",
                        item.subtotal
                    )
            )
        }

        return JSONObject()
            .put(
                "id",
                cart.id
                    ?: JSONObject.NULL
            )
            .put(
                "status",
                cart.status
            )
            .put(
                "items",
                items
            )
            .put(
                "totalItems",
                cart.totalItems
            )
            .put(
                "subtotal",
                cart.subtotal
            )
            .put(
                "currency",
                cart.currency
            )
            .toString()
    }

    fun decode(
        payload: String
    ): MobileCart {

        val json =
            JSONObject(
                payload
            )

        val itemsJson =
            json.optJSONArray(
                "items"
            )
                ?: JSONArray()

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
                        MobileCartItem(
                            id =
                                item.getString(
                                    "id"
                                ),

                            variantId =
                                item.getString(
                                    "variantId"
                                ),

                            productId =
                                item.getString(
                                    "productId"
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

                            colorHex =
                                nullableString(
                                    item,
                                    "colorHex"
                                ),

                            unitPrice =
                                item.getDouble(
                                    "unitPrice"
                                ),

                            currency =
                                item.optString(
                                    "currency",
                                    "BOB"
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

        return MobileCart(
            id =
                nullableString(
                    json,
                    "id"
                ),

            status =
                json.optString(
                    "status",
                    "ACTIVE"
                ),

            items =
                items,

            totalItems =
                items.sumOf {
                    it.quantity
                },

            subtotal =
                items.sumOf {
                    it.subtotal
                },

            currency =
                json.optString(
                    "currency",
                    "BOB"
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