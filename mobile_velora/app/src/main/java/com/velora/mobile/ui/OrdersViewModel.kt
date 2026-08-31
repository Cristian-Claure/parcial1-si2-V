package com.velora.mobile.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.velora.mobile.data.ApiClient
import com.velora.mobile.data.MobileOrder
import com.velora.mobile.data.OrderApi
import com.velora.mobile.data.SessionStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class OrdersUiState(
    val loading: Boolean = true,
    val orders: List<MobileOrder> =
        emptyList(),
    val cancellingOrderId: String? =
        null,
    val error: String =
        "",
    val message: String =
        ""
)

class OrdersViewModel(
    application: Application
) : AndroidViewModel(application) {

    private val session =
        SessionStore(application)

    private val api =
        OrderApi(
            ApiClient(
                tokenProvider = {
                    session.token()
                }
            )
        )

    private val _state =
        MutableStateFlow(
            OrdersUiState()
        )

    val state:
        StateFlow<OrdersUiState> =
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

                val orders =
                    withContext(
                        Dispatchers.IO
                    ) {
                        api.list()
                    }

                _state.value =
                    OrdersUiState(
                        loading = false,
                        orders = orders
                    )

            } catch (
                exception: Exception
            ) {

                _state.value =
                    _state.value.copy(
                        loading = false,
                        error =
                            exception.message
                                ?: "No fue posible cargar sus pedidos."
                    )
            }
        }
    }

    fun cancel(
        orderId: String
    ) {

        if (
            _state.value.cancellingOrderId !=
            null
        ) {
            return
        }

        viewModelScope.launch {

            _state.value =
                _state.value.copy(
                    cancellingOrderId =
                        orderId,
                    error = "",
                    message = ""
                )

            try {

                val cancelled =
                    withContext(
                        Dispatchers.IO
                    ) {
                        api.cancel(
                            orderId
                        )
                    }

                val updated =
                    _state.value.orders.map {
                        order ->

                        if (
                            order.id ==
                                cancelled.id
                        ) {
                            cancelled
                        } else {
                            order
                        }
                    }

                _state.value =
                    _state.value.copy(
                        orders = updated,
                        cancellingOrderId =
                            null,
                        message =
                            "Pedido cancelado correctamente."
                    )

            } catch (
                exception: Exception
            ) {

                _state.value =
                    _state.value.copy(
                        cancellingOrderId =
                            null,
                        error =
                            exception.message
                                ?: "No fue posible cancelar el pedido."
                    )
            }
        }
    }
}