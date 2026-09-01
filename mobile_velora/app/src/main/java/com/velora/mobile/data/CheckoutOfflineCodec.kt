package com.velora.mobile.data

import org.json.JSONArray
import org.json.JSONObject

data class MobileCheckoutOfflineContext(
    val warehouses:
        List<MobileCheckoutWarehouse>,
    val addresses:
        List<MobileCustomerAddress>
)

class CheckoutOfflineCodec {

    fun encode(
        context:
            MobileCheckoutOfflineContext
    ): String {

        val warehouses =
            JSONArray()

        context.warehouses
            .forEach { warehouse ->

                warehouses.put(
                    JSONObject()
                        .put(
                            "warehouseId",
                            warehouse.warehouseId
                        )
                        .put(
                            "warehouseCode",
                            warehouse.warehouseCode
                        )
                        .put(
                            "warehouseName",
                            warehouse.warehouseName
                        )
                        .put(
                            "storeId",
                            warehouse.storeId
                        )
                        .put(
                            "storeName",
                            warehouse.storeName
                        )
                        .put(
                            "storeAddress",
                            warehouse.storeAddress
                                ?: JSONObject.NULL
                        )
                )
            }

        val addresses =
            JSONArray()

        context.addresses
            .forEach { address ->

                addresses.put(
                    JSONObject()
                        .put(
                            "id",
                            address.id
                        )
                        .put(
                            "label",
                            address.label
                        )
                        .put(
                            "recipientName",
                            address.recipientName
                        )
                        .put(
                            "recipientPhone",
                            address.recipientPhone
                        )
                        .put(
                            "department",
                            address.department
                        )
                        .put(
                            "city",
                            address.city
                        )
                        .put(
                            "zone",
                            address.zone
                                ?: JSONObject.NULL
                        )
                        .put(
                            "addressLine",
                            address.addressLine
                        )
                        .put(
                            "reference",
                            address.reference
                                ?: JSONObject.NULL
                        )
                        .put(
                            "defaultAddress",
                            address.defaultAddress
                        )
                )
            }

        return JSONObject()
            .put(
                "warehouses",
                warehouses
            )
            .put(
                "addresses",
                addresses
            )
            .toString()
    }

    fun decode(
        payload: String
    ): MobileCheckoutOfflineContext {

        val root =
            JSONObject(
                payload
            )

        val warehousesJson =
            root.optJSONArray(
                "warehouses"
            )
                ?: JSONArray()

        val addressesJson =
            root.optJSONArray(
                "addresses"
            )
                ?: JSONArray()

        val warehouses =
            buildList {

                for (
                    index in
                    0 until warehousesJson.length()
                ) {
                    val item =
                        warehousesJson
                            .getJSONObject(
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

        val addresses =
            buildList {

                for (
                    index in
                    0 until addressesJson.length()
                ) {
                    val item =
                        addressesJson
                            .getJSONObject(
                                index
                            )

                    add(
                        MobileCustomerAddress(
                            id =
                                item.getString(
                                    "id"
                                ),

                            label =
                                item.getString(
                                    "label"
                                ),

                            recipientName =
                                item.getString(
                                    "recipientName"
                                ),

                            recipientPhone =
                                item.getString(
                                    "recipientPhone"
                                ),

                            department =
                                item.getString(
                                    "department"
                                ),

                            city =
                                item.getString(
                                    "city"
                                ),

                            zone =
                                nullableString(
                                    item,
                                    "zone"
                                ),

                            addressLine =
                                item.getString(
                                    "addressLine"
                                ),

                            reference =
                                nullableString(
                                    item,
                                    "reference"
                                ),

                            defaultAddress =
                                item.optBoolean(
                                    "defaultAddress",
                                    false
                                )
                        )
                    )
                }
            }

        return MobileCheckoutOfflineContext(
            warehouses =
                warehouses,
            addresses =
                addresses
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