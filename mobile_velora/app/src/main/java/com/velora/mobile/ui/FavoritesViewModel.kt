package com.velora.mobile.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.velora.mobile.data.ApiClient
import com.velora.mobile.data.CatalogApi
import com.velora.mobile.data.FavoritesApi
import com.velora.mobile.data.MobileProduct
import com.velora.mobile.data.SessionStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class FavoritesUiState(
    val loading: Boolean = true,
    val products: List<MobileProduct> =
        emptyList(),
    val favoriteProductIds: Set<String> =
        emptySet(),
    val busyProductId: String? =
        null,
    val error: String =
        "",
    val message: String =
        ""
)

class FavoritesViewModel(
    application: Application
) : AndroidViewModel(application) {

    private val session =
        SessionStore(application)

    private val favoritesApi =
        FavoritesApi(
            ApiClient(
                tokenProvider = {
                    session.token()
                }
            )
        )

    private val catalogApi =
        CatalogApi()

    private val _state =
        MutableStateFlow(
            FavoritesUiState()
        )

    val state:
        StateFlow<FavoritesUiState> =
            _state.asStateFlow()

    init {
        load()
    }

    fun load() {

        viewModelScope.launch {

            _state.value =
                _state.value.copy(
                    loading = true,
                    error = "",
                    message = ""
                )

            try {

                val result =
                    withContext(
                        Dispatchers.IO
                    ) {
                        val favorites =
                            favoritesApi.list()

                        val catalog =
                            catalogApi.products()
                                .filter {
                                    it.status ==
                                        "ACTIVE"
                                }

                        Pair(
                            favorites,
                            catalog
                        )
                    }

                val favoriteRows =
                    result.first

                val productById =
                    result.second.associateBy {
                        it.id
                    }

                val products =
                    favoriteRows.mapNotNull {
                        favorite ->
                            productById[
                                favorite.productId
                            ]
                    }

                _state.value =
                    FavoritesUiState(
                        loading = false,
                        products = products,
                        favoriteProductIds =
                            favoriteRows
                                .map {
                                    it.productId
                                }
                                .toSet()
                    )

            } catch (
                exception: Exception
            ) {

                _state.value =
                    _state.value.copy(
                        loading = false,
                        error =
                            exception.message
                                ?: "No se pudieron cargar sus favoritos."
                    )
            }
        }
    }

    fun toggle(
        product: MobileProduct
    ) {

        if (
            _state.value.busyProductId !=
            null
        ) {
            return
        }

        val wasFavorite =
            _state.value
                .favoriteProductIds
                .contains(
                    product.id
                )

        viewModelScope.launch {

            _state.value =
                _state.value.copy(
                    busyProductId =
                        product.id,
                    error = "",
                    message = ""
                )

            try {

                withContext(
                    Dispatchers.IO
                ) {
                    if (wasFavorite) {
                        favoritesApi.remove(
                            product.id
                        )
                    }
                    else {
                        favoritesApi.add(
                            product.id
                        )
                    }
                }

                val currentIds =
                    _state.value
                        .favoriteProductIds

                val nextIds =
                    if (wasFavorite) {
                        currentIds -
                            product.id
                    }
                    else {
                        currentIds +
                            product.id
                    }

                val currentProducts =
                    _state.value.products

                val nextProducts =
                    if (wasFavorite) {
                        currentProducts.filter {
                            it.id !=
                                product.id
                        }
                    }
                    else {
                        listOf(product) +
                            currentProducts
                                .filter {
                                    it.id !=
                                        product.id
                                }
                    }

                _state.value =
                    FavoritesUiState(
                        loading = false,
                        products = nextProducts,
                        favoriteProductIds =
                            nextIds,
                        message =
                            if (wasFavorite) {
                                "La pieza se retiró de favoritos."
                            }
                            else {
                                "La pieza se guardó en favoritos."
                            }
                    )

            } catch (
                exception: Exception
            ) {

                _state.value =
                    _state.value.copy(
                        busyProductId =
                            null,
                        error =
                            exception.message
                                ?: "No se pudieron actualizar sus favoritos."
                    )
            }
        }
    }
}