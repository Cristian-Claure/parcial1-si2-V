package com.velora.mobile.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.velora.mobile.data.ApiClient
import com.velora.mobile.data.CheckoutApi
import com.velora.mobile.data.CustomerApi
import com.velora.mobile.data.MobileCheckoutWarehouse
import com.velora.mobile.data.MobileCustomerAddress
import com.velora.mobile.data.MobileFulfillmentType
import com.velora.mobile.data.MobileOrder
import com.velora.mobile.data.OrderApi
import com.velora.mobile.data.SessionStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class CheckoutUiState(
    val loading: Boolean = true,
    val placingOrder: Boolean = false,

    val warehouses:
        List<MobileCheckoutWarehouse> =
            emptyList(),

    val addresses:
        List<MobileCustomerAddress> =
            emptyList(),

    val fulfillmentType:
        MobileFulfillmentType =
            MobileFulfillmentType.DELIVERY,

    val selectedWarehouseId:
        String? = null,

    val selectedAddressId:
        String? = null,

    val notes:
        String = "",

    val createdOrder:
        MobileOrder? = null,

    val error:
        String = ""
)

class CheckoutViewModel(
    application: Application
) : AndroidViewModel(application) {

    private val session =
        SessionStore(application)

    private val client =
        ApiClient(
            tokenProvider = {
                session.token()
            }
        )

    private val checkoutApi =
        CheckoutApi(client)

    private val customerApi =
        CustomerApi(client)

    private val orderApi =
        OrderApi(client)

    private val _state =
        MutableStateFlow(
            CheckoutUiState()
        )

    val state:
        StateFlow<CheckoutUiState> =
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
                    createdOrder = null
                )

            try {

                val result =
                    withContext(
                        Dispatchers.IO
                    ) {
                        val warehouses =
                            checkoutApi.warehouses()

                        val addresses =
                            customerApi.addresses()

                        Pair(
                            warehouses,
                            addresses
                        )
                    }

                val warehouses =
                    result.first

                val addresses =
                    result.second

                val defaultAddress =
                    addresses.firstOrNull {
                        it.defaultAddress
                    } ?: addresses.firstOrNull()

                _state.value =
                    CheckoutUiState(
                        loading = false,
                        warehouses =
                            warehouses,
                        addresses =
                            addresses,
                        fulfillmentType =
                            MobileFulfillmentType.DELIVERY,
                        selectedWarehouseId =
                            warehouses
                                .firstOrNull()
                                ?.warehouseId,
                        selectedAddressId =
                            defaultAddress?.id
                    )

            } catch (
                exception: Exception
            ) {

                _state.value =
                    _state.value.copy(
                        loading = false,
                        error =
                            exception.message
                                ?: "No fue posible preparar el checkout."
                    )
            }
        }
    }

    fun selectFulfillment(
        type: MobileFulfillmentType
    ) {

        if (
            type !=
                MobileFulfillmentType.DELIVERY &&
            type !=
                MobileFulfillmentType.PICKUP
        ) {
            return
        }

        val current =
            _state.value

        val addressId =
            if (
                type ==
                    MobileFulfillmentType.PICKUP
            ) {
                null
            } else {
                current.addresses
                    .firstOrNull {
                        it.defaultAddress
                    }
                    ?.id
                    ?: current.addresses
                        .firstOrNull()
                        ?.id
            }

        _state.value =
            current.copy(
                fulfillmentType = type,
                selectedAddressId =
                    addressId,
                error = "",
                createdOrder = null
            )
    }

    fun selectWarehouse(
        warehouseId: String
    ) {
        _state.value =
            _state.value.copy(
                selectedWarehouseId =
                    warehouseId,
                error = "",
                createdOrder = null
            )
    }

    fun selectAddress(
        addressId: String
    ) {

        if (
            _state.value
                .fulfillmentType !=
                MobileFulfillmentType.DELIVERY
        ) {
            return
        }

        _state.value =
            _state.value.copy(
                selectedAddressId =
                    addressId,
                error = "",
                createdOrder = null
            )
    }

    fun updateNotes(
        value: String
    ) {

        if (value.length > 500) {
            return
        }

        _state.value =
            _state.value.copy(
                notes = value,
                error = "",
                createdOrder = null
            )
    }

    fun placeOrder() {

        val current =
            _state.value

        if (
            current.loading ||
            current.placingOrder
        ) {
            return
        }

        if (
            current.warehouses.isEmpty()
        ) {
            _state.value =
                current.copy(
                    error =
                        "Ninguna sucursal puede abastecer actualmente todos los productos de la bolsa."
                )

            return
        }

        val warehouseId =
            current.selectedWarehouseId

        if (
            warehouseId.isNullOrBlank()
        ) {
            _state.value =
                current.copy(
                    error =
                        "Seleccione una sucursal de abastecimiento."
                )

            return
        }

        if (
            current.fulfillmentType ==
                MobileFulfillmentType.DELIVERY &&
            current.selectedAddressId
                .isNullOrBlank()
        ) {
            _state.value =
                current.copy(
                    error =
                        "Seleccione una dirección de entrega."
                )

            return
        }

        _state.value =
            current.copy(
                placingOrder = true,
                error = "",
                createdOrder = null
            )

        viewModelScope.launch {

            try {

                val order =
                    withContext(
                        Dispatchers.IO
                    ) {
                        orderApi.create(
                            warehouseId =
                                warehouseId,
                            fulfillmentType =
                                current.fulfillmentType,
                            addressId =
                                if (
                                    current.fulfillmentType ==
                                        MobileFulfillmentType.DELIVERY
                                ) {
                                    current.selectedAddressId
                                } else {
                                    null
                                },
                            notes =
                                current.notes
                                    .trim()
                                    .takeIf {
                                        it.isNotEmpty()
                                    }
                        )
                    }

                _state.value =
                    _state.value.copy(
                        placingOrder = false,
                        createdOrder = order,
                        error = ""
                    )

            } catch (
                exception: Exception
            ) {

                _state.value =
                    _state.value.copy(
                        placingOrder = false,
                        error =
                            exception.message
                                ?: "No fue posible generar el pedido."
                    )
            }
        }
    }
}