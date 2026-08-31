package com.velora.mobile.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.velora.mobile.data.ApiClient
import com.velora.mobile.data.CartApi
import com.velora.mobile.data.MobileCart
import com.velora.mobile.data.SessionStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class CartUiState(
    val loading: Boolean = false,
    val cart: MobileCart =
        MobileCart(),
    val busyVariantId: String? =
        null,
    val busyItemId: String? =
        null,
    val clearing: Boolean =
        false,
    val error: String =
        "",
    val message: String =
        ""
)

class CartViewModel(
    application: Application
) : AndroidViewModel(application) {

    private val session =
        SessionStore(application)

    private val api =
        CartApi(
            ApiClient(
                tokenProvider = {
                    session.token()
                }
            )
        )

    private val _state =
        MutableStateFlow(
            CartUiState(
                loading = true
            )
        )

    val state: StateFlow<CartUiState> =
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

                val cart =
                    withContext(
                        Dispatchers.IO
                    ) {
                        api.load()
                    }

                _state.value =
                    CartUiState(
                        cart = cart
                    )

            } catch (
                exception: Exception
            ) {

                _state.value =
                    _state.value.copy(
                        loading = false,
                        error =
                            exception.message
                                ?: "No se pudo cargar la bolsa."
                    )
            }
        }
    }

    fun addVariant(
        variantId: String
    ) {

        if (
            _state.value.busyVariantId !=
            null
        ) {
            return
        }

        viewModelScope.launch {

            _state.value =
                _state.value.copy(
                    busyVariantId =
                        variantId,
                    error = "",
                    message = ""
                )

            try {

                val cart =
                    withContext(
                        Dispatchers.IO
                    ) {
                        api.add(
                            variantId
                        )
                    }

                _state.value =
                    CartUiState(
                        cart = cart,
                        message =
                            "Producto añadido a la bolsa."
                    )

            } catch (
                exception: Exception
            ) {

                _state.value =
                    _state.value.copy(
                        busyVariantId =
                            null,
                        error =
                            exception.message
                                ?: "No se pudo añadir el producto."
                    )
            }
        }
    }

    fun increase(
        itemId: String,
        currentQuantity: Int
    ) {
        update(
            itemId = itemId,
            quantity =
                currentQuantity + 1
        )
    }

    fun decrease(
        itemId: String,
        currentQuantity: Int
    ) {

        if (currentQuantity <= 1) {
            remove(itemId)
            return
        }

        update(
            itemId = itemId,
            quantity =
                currentQuantity - 1
        )
    }

    fun remove(
        itemId: String
    ) {

        mutateItem(
            itemId = itemId
        ) {
            api.remove(
                itemId
            )
        }
    }

    fun clear() {

        if (_state.value.clearing) {
            return
        }

        viewModelScope.launch {

            _state.value =
                _state.value.copy(
                    clearing = true,
                    error = "",
                    message = ""
                )

            try {

                withContext(
                    Dispatchers.IO
                ) {
                    api.clear()
                }

                _state.value =
                    CartUiState(
                        cart =
                            MobileCart(),
                        message =
                            "La bolsa quedó vacía."
                    )

            } catch (
                exception: Exception
            ) {

                _state.value =
                    _state.value.copy(
                        clearing = false,
                        error =
                            exception.message
                                ?: "No se pudo vaciar la bolsa."
                    )
            }
        }
    }

    private fun update(
        itemId: String,
        quantity: Int
    ) {

        mutateItem(
            itemId = itemId
        ) {
            api.update(
                itemId,
                quantity
            )
        }
    }

    private fun mutateItem(
        itemId: String,
        action: () -> MobileCart
    ) {

        if (
            _state.value.busyItemId !=
            null
        ) {
            return
        }

        viewModelScope.launch {

            _state.value =
                _state.value.copy(
                    busyItemId =
                        itemId,
                    error = "",
                    message = ""
                )

            try {

                val cart =
                    withContext(
                        Dispatchers.IO
                    ) {
                        action()
                    }

                _state.value =
                    CartUiState(
                        cart = cart
                    )

            } catch (
                exception: Exception
            ) {

                _state.value =
                    _state.value.copy(
                        busyItemId =
                            null,
                        error =
                            exception.message
                                ?: "No se pudo actualizar la bolsa."
                    )
            }
        }
    }
}