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
    val price: Double,
    val currency: String,
    val active: Boolean
)

data class MobileProduct(
    val id: String,
    val categoryName: String,
    val name: String,
    val description: String?,
    val brand: String?,
    val status: String,
    val variants: List<MobileVariant>
)

class CatalogApi(
    private val baseUrl: String = "http://10.0.2.2:8080/api"
) {

    fun products(): List<MobileProduct> {
        val connection =
            (URL("$baseUrl/catalog/products").openConnection() as HttpURLConnection)
                .apply {
                    requestMethod = "GET"
                    connectTimeout = 10_000
                    readTimeout = 10_000
                    setRequestProperty("Accept", "application/json")
                }

        try {
            val status = connection.responseCode

            val stream =
                if (status in 200..299) {
                    connection.inputStream
                } else {
                    connection.errorStream
                }

            val responseText =
                stream?.bufferedReader(Charsets.UTF_8)?.use {
                    it.readText()
                }.orEmpty()

            if (status !in 200..299) {
                throw IllegalStateException(
                    "No se pudo cargar el catálogo."
                )
            }

            val array = JSONArray(responseText)

            return buildList {
                for (index in 0 until array.length()) {
                    add(parseProduct(array.getJSONObject(index)))
                }
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun parseProduct(json: JSONObject): MobileProduct {
        val variantsJson =
            json.optJSONArray("variants")
                ?: JSONArray()

        val variants = buildList {
            for (index in 0 until variantsJson.length()) {
                val variant =
                    variantsJson.getJSONObject(index)

                add(
                    MobileVariant(
                        id = variant.getString("id"),
                        sku = variant.getString("sku"),
                        size = variant.getString("size"),
                        color = variant.getString("color"),
                        price = variant.getDouble("price"),
                        currency = variant.optString(
                            "currency",
                            "BOB"
                        ),
                        active = variant.optBoolean(
                            "active",
                            true
                        )
                    )
                )
            }
        }

        return MobileProduct(
            id = json.getString("id"),
            categoryName = json.optString(
                "categoryName",
                "Colección"
            ),
            name = json.getString("name"),
            description = json
                .optString("description")
                .takeIf { it.isNotBlank() },
            brand = json
                .optString("brand")
                .takeIf { it.isNotBlank() },
            status = json.optString(
                "status",
                "ACTIVE"
            ),
            variants = variants
        )
    }
}