package com.velora.mobile.data

import org.json.JSONObject

data class MobileCheckoutWarehouse(
    val warehouseId: String,
    val warehouseCode: String,
    val warehouseName: String,
    val storeId: String,
    val storeName: String,
    val storeAddress: String?
)

class CheckoutApi(
    private val client: ApiClient
) {

    fun warehouses():
        List<MobileCheckoutWarehouse> {

        val array =
            client.getArray(
                "/customer/checkout/warehouses"
            )

        return buildList {

            for (
                index in
                0 until array.length()
            ) {

                val item =
                    array.getJSONObject(
                        index
                    )

                add(
                    MobileCheckoutWarehouse(
                        warehouseId =
                            item.getString(
                                "warehouseId"
                            ),

                        warehouseCode =
                            item.getString(
                                "warehouseCode"
                            ),

                        warehouseName =
                            item.getString(
                                "warehouseName"
                            ),

                        storeId =
                            item.getString(
                                "storeId"
                            ),

                        storeName =
                            item.getString(
                                "storeName"
                            ),

                        storeAddress =
                            nullableString(
                                item,
                                "storeAddress"
                            )
                    )
                )
            }
        }
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