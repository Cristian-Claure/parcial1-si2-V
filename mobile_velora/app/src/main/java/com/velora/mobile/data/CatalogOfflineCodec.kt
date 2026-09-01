package com.velora.mobile.data

import org.json.JSONArray
import org.json.JSONObject

class CatalogOfflineCodec {

    fun encode(
        products: List<MobileProduct>
    ): String {

        val array =
            JSONArray()

        products.forEach { product ->

            val variants =
                JSONArray()

            product.variants
                .forEach { variant ->

                    variants.put(
                        JSONObject()
                            .put(
                                "id",
                                variant.id
                            )
                            .put(
                                "sku",
                                variant.sku
                            )
                            .put(
                                "size",
                                variant.size
                            )
                            .put(
                                "color",
                                variant.color
                            )
                            .put(
                                "price",
                                variant.price
                            )
                            .put(
                                "currency",
                                variant.currency
                            )
                            .put(
                                "active",
                                variant.active
                            )
                    )
                }

            array.put(
                JSONObject()
                    .put(
                        "id",
                        product.id
                    )
                    .put(
                        "categoryName",
                        product.categoryName
                    )
                    .put(
                        "name",
                        product.name
                    )
                    .put(
                        "description",
                        product.description
                            ?: JSONObject.NULL
                    )
                    .put(
                        "brand",
                        product.brand
                            ?: JSONObject.NULL
                    )
                    .put(
                        "status",
                        product.status
                    )
                    .put(
                        "variants",
                        variants
                    )
            )
        }

        return array.toString()
    }

    fun decode(
        payload: String
    ): List<MobileProduct> {

        val array =
            JSONArray(
                payload
            )

        return buildList {

            for (
                index in
                0 until array.length()
            ) {

                val product =
                    array.getJSONObject(
                        index
                    )

                val variantsJson =
                    product.optJSONArray(
                        "variants"
                    )
                        ?: JSONArray()

                val variants =
                    buildList {

                        for (
                            variantIndex in
                            0 until variantsJson.length()
                        ) {

                            val variant =
                                variantsJson
                                    .getJSONObject(
                                        variantIndex
                                    )

                            add(
                                MobileVariant(
                                    id =
                                        variant.getString(
                                            "id"
                                        ),

                                    sku =
                                        variant.getString(
                                            "sku"
                                        ),

                                    size =
                                        variant.getString(
                                            "size"
                                        ),

                                    color =
                                        variant.getString(
                                            "color"
                                        ),

                                    price =
                                        variant.getDouble(
                                            "price"
                                        ),

                                    currency =
                                        variant.optString(
                                            "currency",
                                            "BOB"
                                        ),

                                    active =
                                        variant.optBoolean(
                                            "active",
                                            true
                                        )
                                )
                            )
                        }
                    }

                add(
                    MobileProduct(
                        id =
                            product.getString(
                                "id"
                            ),

                        categoryName =
                            product.optString(
                                "categoryName",
                                "Colección"
                            ),

                        name =
                            product.getString(
                                "name"
                            ),

                        description =
                            nullableString(
                                product,
                                "description"
                            ),

                        brand =
                            nullableString(
                                product,
                                "brand"
                            ),

                        status =
                            product.optString(
                                "status",
                                "ACTIVE"
                            ),

                        variants =
                            variants
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
            .optString(
                key
            )
            .takeIf {
                it.isNotBlank()
            }
    }
}