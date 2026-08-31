package com.velora.mobile.data

import org.json.JSONArray
import org.json.JSONObject

data class MobileCartItem(
    val id: String,
    val variantId: String,
    val productId: String,
    val productName: String,
    val sku: String,
    val size: String,
    val color: String,
    val colorHex: String?,
    val unitPrice: Double,
    val currency: String,
    val quantity: Int,
    val subtotal: Double
)

data class MobileCart(
    val id: String? = null,
    val status: String = "ACTIVE",
    val items: List<MobileCartItem> =
        emptyList(),
    val totalItems: Int = 0,
    val subtotal: Double = 0.0,
    val currency: String = "BOB"
)

class CartApi(
    private val client: ApiClient
) {

    fun load(): MobileCart {
        return parseCart(
            client.getObject(
                "/customer/cart"
            )
        )
    }

    fun add(
        variantId: String,
        quantity: Int = 1
    ): MobileCart {

        val request =
            JSONObject()
                .put(
                    "variantId",
                    variantId
                )
                .put(
                    "quantity",
                    quantity
                )

        return parseCart(
            client.postObject(
                "/customer/cart/items",
                request
            )
        )
    }

    fun update(
        itemId: String,
        quantity: Int
    ): MobileCart {

        val request =
            JSONObject()
                .put(
                    "quantity",
                    quantity
                )

        return parseCart(
            client.putObject(
                "/customer/cart/items/$itemId",
                request
            )
        )
    }

    fun remove(
        itemId: String
    ): MobileCart {

        return parseCart(
            client.deleteObject(
                "/customer/cart/items/$itemId"
            )
        )
    }

    fun clear() {
        client.deleteNoContent(
            "/customer/cart"
        )
    }

    private fun parseCart(
        json: JSONObject
    ): MobileCart {

        val itemsJson =
            json.optJSONArray("items")
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
                                item
                                    .optString(
                                        "colorHex"
                                    )
                                    .takeIf {
                                        it.isNotBlank()
                                    },

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

        val calculatedItems =
            items.sumOf {
                it.quantity
            }

        val calculatedSubtotal =
            items.sumOf {
                it.subtotal
            }

        return MobileCart(
            id =
                json
                    .optString("id")
                    .takeIf {
                        it.isNotBlank()
                    },

            status =
                json.optString(
                    "status",
                    "ACTIVE"
                ),

            items = items,

            totalItems =
                if (
                    json.has("totalItems")
                ) {
                    json.optInt(
                        "totalItems"
                    )
                } else {
                    calculatedItems
                },

            subtotal =
                if (
                    json.has("subtotal")
                ) {
                    json.optDouble(
                        "subtotal"
                    )
                } else {
                    calculatedSubtotal
                },

            currency =
                json.optString(
                    "currency",
                    "BOB"
                )
        )
    }
}