package com.velora.mobile.data

import org.json.JSONObject

data class MobileCustomerAddress(
    val id: String,
    val label: String,
    val recipientName: String,
    val recipientPhone: String,
    val department: String,
    val city: String,
    val zone: String?,
    val addressLine: String,
    val reference: String?,
    val defaultAddress: Boolean
)

class CustomerApi(
    private val client: ApiClient
) {

    fun addresses():
        List<MobileCustomerAddress> {

        val array =
            client.getArray(
                "/customer/addresses"
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