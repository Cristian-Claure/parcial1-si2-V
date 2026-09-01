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
                                "colorHex",
                                variant.colorHex
                                    ?: JSONObject.NULL
                            )
                            .put(
                                "price",
                                variant.price
                            )
                            .put(
                                "compareAtPrice",
                                variant.compareAtPrice
                                    ?: JSONObject.NULL
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

            val images =
                JSONArray()

            product.images
                .forEach { image ->

                    images.put(
                        JSONObject()
                            .put(
                                "id",
                                image.id
                            )
                            .put(
                                "variantId",
                                image.variantId
                                    ?: JSONObject.NULL
                            )
                            .put(
                                "imageUrl",
                                image.imageUrl
                            )
                            .put(
                                "altText",
                                image.altText
                                    ?: JSONObject.NULL
                            )
                            .put(
                                "sortOrder",
                                image.sortOrder
                            )
                            .put(
                                "primary",
                                image.primary
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
                        "slug",
                        product.slug
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
                        "composition",
                        product.composition
                            ?: JSONObject.NULL
                    )
                    .put(
                        "careInstructions",
                        product.careInstructions
                            ?: JSONObject.NULL
                    )
                    .put(
                        "fitNotes",
                        product.fitNotes
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
                    .put(
                        "images",
                        images
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

                                    colorHex =
                                        nullableString(
                                            variant,
                                            "colorHex"
                                        ),

                                    price =
                                        variant.getDouble(
                                            "price"
                                        ),

                                    compareAtPrice =
                                        nullableDouble(
                                            variant,
                                            "compareAtPrice"
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

                val imagesJson =
                    product.optJSONArray(
                        "images"
                    )
                        ?: JSONArray()

                val images =
                    buildList {

                        for (
                            imageIndex in
                            0 until imagesJson.length()
                        ) {

                            val image =
                                imagesJson
                                    .getJSONObject(
                                        imageIndex
                                    )

                            add(
                                MobileImage(
                                    id =
                                        image.getString(
                                            "id"
                                        ),

                                    variantId =
                                        nullableString(
                                            image,
                                            "variantId"
                                        ),

                                    imageUrl =
                                        image.getString(
                                            "imageUrl"
                                        ),

                                    altText =
                                        nullableString(
                                            image,
                                            "altText"
                                        ),

                                    sortOrder =
                                        image.optInt(
                                            "sortOrder",
                                            0
                                        ),

                                    primary =
                                        image.optBoolean(
                                            "primary",
                                            false
                                        )
                                )
                            )
                        }
                    }

                val id =
                    product.getString(
                        "id"
                    )

                add(
                    MobileProduct(
                        id =
                            id,

                        categoryName =
                            product.optString(
                                "categoryName",
                                "Colección"
                            ),

                        name =
                            product.getString(
                                "name"
                            ),

                        slug =
                            nullableString(
                                product,
                                "slug"
                            )
                                ?: id,

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

                        composition =
                            nullableString(
                                product,
                                "composition"
                            ),

                        careInstructions =
                            nullableString(
                                product,
                                "careInstructions"
                            ),

                        fitNotes =
                            nullableString(
                                product,
                                "fitNotes"
                            ),

                        status =
                            product.optString(
                                "status",
                                "ACTIVE"
                            ),

                        variants =
                            variants,

                        images =
                            images
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

    private fun nullableDouble(
        json: JSONObject,
        key: String
    ): Double? {

        if (
            !json.has(key) ||
            json.isNull(key)
        ) {
            return null
        }

        return runCatching {
            json.getDouble(
                key
            )
        }
            .getOrNull()
    }
}