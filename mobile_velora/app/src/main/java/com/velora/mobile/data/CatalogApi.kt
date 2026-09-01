package com.velora.mobile.data

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class MobileVariant(
    val id: String,
    val sku: String,
    val size: String,
    val color: String,
    val colorHex: String?,
    val price: Double,
    val compareAtPrice: Double?,
    val currency: String,
    val active: Boolean
)

data class MobileImage(
    val id: String,
    val variantId: String?,
    val imageUrl: String,
    val altText: String?,
    val sortOrder: Int,
    val primary: Boolean
)

data class MobileProduct(
    val id: String,
    val categoryName: String,
    val name: String,
    val slug: String,
    val description: String?,
    val brand: String?,
    val composition: String?,
    val careInstructions: String?,
    val fitNotes: String?,
    val status: String,
    val variants: List<MobileVariant>,
    val images: List<MobileImage>
)

class CatalogApi(
    private val baseUrl: String = "http://10.0.2.2:8080/api"
) {

    fun products(): List<MobileProduct> {
        val connection =
            (
                URL(
                    "$baseUrl/catalog/products"
                ).openConnection()
                    as HttpURLConnection
            )
                .apply {
                    requestMethod = "GET"
                    connectTimeout = 10_000
                    readTimeout = 10_000

                    setRequestProperty(
                        "Accept",
                        "application/json"
                    )
                }

        try {
            val status =
                connection.responseCode

            val stream =
                if (
                    status in 200..299
                ) {
                    connection.inputStream
                }
                else {
                    connection.errorStream
                }

            val responseText =
                stream
                    ?.bufferedReader(
                        Charsets.UTF_8
                    )
                    ?.use {
                        it.readText()
                    }
                    .orEmpty()

            if (
                status !in 200..299
            ) {
                throw IllegalStateException(
                    "No se pudo cargar el catálogo."
                )
            }

            val array =
                JSONArray(
                    responseText
                )

            return buildList {
                for (
                    index in
                    0 until array.length()
                ) {
                    add(
                        parseProduct(
                            array.getJSONObject(
                                index
                            )
                        )
                    )
                }
            }
        }
        finally {
            connection.disconnect()
        }
    }

    private fun parseProduct(
        json: JSONObject
    ): MobileProduct {

        val variantsJson =
            json.optJSONArray(
                "variants"
            )
                ?: JSONArray()

        val variants =
            buildList {
                for (
                    index in
                    0 until variantsJson.length()
                ) {
                    val variant =
                        variantsJson
                            .getJSONObject(
                                index
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
            json.optJSONArray(
                "images"
            )
                ?: JSONArray()

        val images =
            buildList {
                for (
                    index in
                    0 until imagesJson.length()
                ) {
                    val image =
                        imagesJson
                            .getJSONObject(
                                index
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

        return MobileProduct(
            id =
                json.getString(
                    "id"
                ),

            categoryName =
                json.optString(
                    "categoryName",
                    "Colección"
                ),

            name =
                json.getString(
                    "name"
                ),

            slug =
                json
                    .optString(
                        "slug"
                    )
                    .takeIf {
                        it.isNotBlank()
                    }
                    ?: json.getString(
                        "id"
                    ),

            description =
                nullableString(
                    json,
                    "description"
                ),

            brand =
                nullableString(
                    json,
                    "brand"
                ),

            composition =
                nullableString(
                    json,
                    "composition"
                ),

            careInstructions =
                nullableString(
                    json,
                    "careInstructions"
                ),

            fitNotes =
                nullableString(
                    json,
                    "fitNotes"
                ),

            status =
                json.optString(
                    "status",
                    "ACTIVE"
                ),

            variants =
                variants,

            images =
                images
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