package com.velora.mobile.data

data class MobileFavorite(
    val id: String,
    val productId: String,
    val createdAt: String
)

class FavoritesApi(
    private val client: ApiClient
) {

    fun list():
        List<MobileFavorite> {

        val array =
            client.getArray(
                "/customer/favorites"
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
                    MobileFavorite(
                        id =
                            item.getString(
                                "id"
                            ),

                        productId =
                            item.getString(
                                "productId"
                            ),

                        createdAt =
                            item.optString(
                                "createdAt"
                            )
                    )
                )
            }
        }
    }

    fun add(
        productId: String
    ): MobileFavorite {

        val item =
            client.postObject(
                "/customer/favorites/$productId",
                org.json.JSONObject()
            )

        return MobileFavorite(
            id =
                item.getString(
                    "id"
                ),

            productId =
                item.getString(
                    "productId"
                ),

            createdAt =
                item.optString(
                    "createdAt"
                )
        )
    }

    fun remove(
        productId: String
    ) {
        client.deleteNoContent(
            "/customer/favorites/$productId"
        )
    }
}