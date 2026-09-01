package com.velora.mobile.ui

import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.velora.mobile.data.ApiClient
import com.velora.mobile.data.CheckoutApi
import com.velora.mobile.data.CustomerApi
import com.velora.mobile.data.CheckoutOfflineCodec
import com.velora.mobile.data.CustomerOfflineScope
import com.velora.mobile.data.CustomerOfflineStore
import com.velora.mobile.data.CartOfflineCodec
import com.velora.mobile.data.CustomerOfflineOrderQueue
import com.velora.mobile.data.MobileOfflineOrderItemRequest
import com.velora.mobile.data.MobileOfflineOrderRequest
import com.velora.mobile.data.MobileOfflineSyncOutcome
import com.velora.mobile.data.MobileOfflineSyncState
import com.velora.mobile.data.MobileOfflineOrderQueueStatus
import com.velora.mobile.data.MobileCheckoutOfflineContext
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
import java.io.IOException
import java.time.Instant
import java.util.UUID

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

    val offlineOperationId:
        String? = null,

    val offlineSyncState:
        MobileOfflineSyncState? = null,

    val message:
        String = "",

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

    private val offlineStore =
        CustomerOfflineStore(
            application
        )

    private val offlineCodec =
        CheckoutOfflineCodec()

    private val cartOfflineCodec =
        CartOfflineCodec()

    private val offlineOrderQueue =
        CustomerOfflineOrderQueue(
            application
        )

    private val connectivityManager =
        application.getSystemService(
            Context.CONNECTIVITY_SERVICE
        ) as ConnectivityManager

    private val connectivityRequest =
        NetworkRequest.Builder()
            .addCapability(
                NetworkCapabilities.NET_CAPABILITY_INTERNET
            )
            .build()

    private var networkCallbackRegistered =
        false

    private val networkCallback =
        object :
            ConnectivityManager.NetworkCallback() {

            override fun onCapabilitiesChanged(
                network: Network,
                networkCapabilities:
                    NetworkCapabilities
            ) {

                if (
                    hasValidatedInternet(
                        networkCapabilities
                    )
                ) {
                    attemptAutomaticSync()
                }
            }
        }

    private val _state =
        MutableStateFlow(
            CheckoutUiState()
        )

    val state:
        StateFlow<CheckoutUiState> =
            _state.asStateFlow()

    init {
        restoreQueuedOperation()
        registerConnectivityCallback()
        syncIfAlreadyConnected()
        load()
    }

    private fun registerConnectivityCallback() {

        if (
            networkCallbackRegistered
        ) {
            return
        }

        try {

            connectivityManager
                .registerNetworkCallback(
                    connectivityRequest,
                    networkCallback
                )

            networkCallbackRegistered =
                true

        } catch (
            exception: SecurityException
        ) {

            _state.value =
                _state.value.copy(
                    error =
                        "No fue posible activar la detección automática de conectividad."
                )
        }
    }

    private fun syncIfAlreadyConnected() {

        if (
            Build.VERSION.SDK_INT <
                Build.VERSION_CODES.M
        ) {
            return
        }

        val network =
            connectivityManager
                .activeNetwork
                ?: return

        val capabilities =
            connectivityManager
                .getNetworkCapabilities(
                    network
                )
                ?: return

        if (
            hasValidatedInternet(
                capabilities
            )
        ) {
            attemptAutomaticSync()
        }
    }

    private fun hasValidatedInternet(
        capabilities:
            NetworkCapabilities
    ): Boolean {

        if (
            Build.VERSION.SDK_INT <
                Build.VERSION_CODES.M
        ) {
            return false
        }

        return capabilities
            .hasCapability(
                NetworkCapabilities
                    .NET_CAPABILITY_INTERNET
            ) &&
            capabilities
                .hasCapability(
                    NetworkCapabilities
                        .NET_CAPABILITY_VALIDATED
                )
    }

    private fun attemptAutomaticSync() {

        val current =
            _state.value

        val operationId =
            current.offlineOperationId

        if (
            current.placingOrder ||
            operationId.isNullOrBlank() ||
            current.offlineSyncState !=
                MobileOfflineSyncState.PENDING
        ) {
            return
        }

        syncQueuedOrder(
            operationId
        )
    }

    override fun onCleared() {

        if (
            networkCallbackRegistered
        ) {

            runCatching {
                connectivityManager
                    .unregisterNetworkCallback(
                        networkCallback
                    )
            }

            networkCallbackRegistered =
                false
        }

        super.onCleared()
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

                        MobileCheckoutOfflineContext(
                            warehouses =
                                warehouses,
                            addresses =
                                addresses
                        )
                    }

                withContext(
                    Dispatchers.IO
                ) {
                    offlineStore.save(
                        CustomerOfflineScope.CHECKOUT,
                        offlineCodec.encode(
                            result
                        )
                    )
                }

                applyContext(
                    context = result,
                    message = ""
                )

            } catch (
                exception: Exception
            ) {

                if (
                    exception !is IOException
                ) {
                    _state.value =
                        _state.value.copy(
                            loading = false,
                            error =
                                exception.message
                                    ?: "No fue posible preparar el checkout."
                        )

                    return@launch
                }

                val cached =
                    runCatching {
                        withContext(
                            Dispatchers.IO
                        ) {
                            offlineStore
                                .load(
                                    CustomerOfflineScope.CHECKOUT
                                )
                                ?.let {
                                    offlineCodec.decode(
                                        it
                                    )
                                }
                        }
                    }
                        .getOrNull()

                if (cached != null) {
                    applyContext(
                        context = cached,
                        message =
                            "Checkout disponible con datos guardados."
                    )
                } else {
                    _state.value =
                        _state.value.copy(
                            loading = false,
                            error =
                                "No existe información guardada para preparar el checkout sin conexión."
                        )
                }
            }
        }
    }

    private fun applyContext(
        context:
            MobileCheckoutOfflineContext,
        message: String
    ) {

        val defaultAddress =
            context.addresses
                .firstOrNull {
                    it.defaultAddress
                }
                ?: context.addresses
                    .firstOrNull()

        val current =
            _state.value

        val effectiveMessage =
            if (
                !current.offlineOperationId
                    .isNullOrBlank()
            ) {
                current.message
            }
            else {
                message
            }

        _state.value =
            current.copy(
                loading = false,
                warehouses =
                    context.warehouses,
                addresses =
                    context.addresses,
                fulfillmentType =
                    MobileFulfillmentType.DELIVERY,
                selectedWarehouseId =
                    context.warehouses
                        .firstOrNull()
                        ?.warehouseId,
                selectedAddressId =
                    defaultAddress?.id,
                message =
                    effectiveMessage,
                error = ""
            )
    }

    private fun restoreQueuedOperation() {

        val entries =
            runCatching {

                offlineOrderQueue
                    .recoverStaleSyncing()

                offlineOrderQueue
                    .entries()
            }
                .getOrNull()
                ?: return

        val conflict =
            entries.firstOrNull {
                it.status ==
                    MobileOfflineOrderQueueStatus.CONFLICT
            }

        val pending =
            entries.firstOrNull {
                it.status ==
                    MobileOfflineOrderQueueStatus.PENDING ||
                it.status ==
                    MobileOfflineOrderQueueStatus.SYNCING
            }

        val entry =
            conflict
                ?: pending
                ?: return

        val syncState =
            if (
                entry.status ==
                    MobileOfflineOrderQueueStatus.CONFLICT
            ) {
                MobileOfflineSyncState.CONFLICT
            }
            else {
                MobileOfflineSyncState.PENDING
            }

        val message =
            if (
                syncState ==
                    MobileOfflineSyncState.CONFLICT
            ) {
                entry.conflictMessage
                    ?: "El pedido guardado necesita revisión antes de sincronizarse."
            }
            else {
                "Tiene un pedido guardado pendiente de sincronización."
            }

        _state.value =
            _state.value.copy(
                offlineOperationId =
                    entry.clientOperationId,
                offlineSyncState =
                    syncState,
                message =
                    message,
                error = ""
            )
    }

    fun retryOfflineConflict() {

        val current =
            _state.value

        val operationId =
            current.offlineOperationId

        if (
            current.placingOrder ||
            operationId.isNullOrBlank() ||
            current.offlineSyncState !=
                MobileOfflineSyncState.CONFLICT
        ) {
            return
        }

        _state.value =
            current.copy(
                placingOrder = true,
                message =
                    "Reintentando el pedido guardado...",
                error = ""
            )

        viewModelScope.launch {

            try {

                val outcome =
                    withContext(
                        Dispatchers.IO
                    ) {

                        val changed =
                            offlineOrderQueue
                                .retryConflict(
                                    operationId
                                )

                        if (!changed) {
                            throw IllegalStateException(
                                "El pedido ya no se encuentra en conflicto."
                            )
                        }

                        offlineOrderQueue
                            .syncOperation(
                                operationId
                            )
                    }

                applySyncOutcome(
                    outcome
                )

            } catch (
                exception: Exception
            ) {

                _state.value =
                    _state.value.copy(
                        placingOrder = false,
                        error =
                            exception.message
                                ?: "No fue posible reintentar el pedido."
                    )
            }
        }
    }

    fun discardOfflineOrder() {

        val current =
            _state.value

        val operationId =
            current.offlineOperationId

        if (
            current.placingOrder ||
            operationId.isNullOrBlank()
        ) {
            return
        }

        viewModelScope.launch {

            try {

                val removed =
                    withContext(
                        Dispatchers.IO
                    ) {
                        offlineOrderQueue
                            .discard(
                                operationId
                            )
                    }

                if (!removed) {
                    throw IllegalStateException(
                        "El pedido guardado ya no existe."
                    )
                }

                _state.value =
                    _state.value.copy(
                        offlineOperationId =
                            null,
                        offlineSyncState =
                            null,
                        createdOrder =
                            null,
                        message =
                            "Pedido guardado descartado. Puede revisar la bolsa y generar uno nuevo.",
                        error = ""
                    )

            } catch (
                exception: Exception
            ) {

                _state.value =
                    _state.value.copy(
                        error =
                            exception.message
                                ?: "No fue posible descartar el pedido guardado."
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

        val queuedOperationId =
            current.offlineOperationId

        if (
            !queuedOperationId
                .isNullOrBlank()
        ) {
            syncQueuedOrder(
                queuedOperationId
            )

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
                message = "",
                createdOrder = null
            )

        viewModelScope.launch {

            try {

                val request =
                    withContext(
                        Dispatchers.IO
                    ) {

                        val cartPayload =
                            offlineStore.load(
                                CustomerOfflineScope.CART
                            )
                                ?: throw IllegalStateException(
                                    "No existe una bolsa guardada para generar el pedido."
                                )

                        val cart =
                            cartOfflineCodec.decode(
                                cartPayload
                            )

                        if (
                            cart.items.isEmpty()
                        ) {
                            throw IllegalStateException(
                                "La bolsa está vacía."
                            )
                        }

                        MobileOfflineOrderRequest(
                            clientOperationId =
                                UUID.randomUUID()
                                    .toString(),

                            clientCreatedAt =
                                Instant.now()
                                    .toString(),

                            sourceCartId =
                                cart.id,

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
                                }
                                else {
                                    null
                                },

                            notes =
                                current.notes
                                    .trim()
                                    .takeIf {
                                        it.isNotEmpty()
                                    },

                            items =
                                cart.items.map {
                                    item ->

                                    MobileOfflineOrderItemRequest(
                                        variantId =
                                            item.variantId,

                                        quantity =
                                            item.quantity
                                    )
                                }
                        )
                    }

                withContext(
                    Dispatchers.IO
                ) {
                    offlineOrderQueue.enqueue(
                        request
                    )
                }

                _state.value =
                    _state.value.copy(
                        offlineOperationId =
                            request.clientOperationId,

                        offlineSyncState =
                            MobileOfflineSyncState.PENDING,

                        message =
                            "Pedido guardado. Intentando sincronizar...",

                        error = ""
                    )

                val outcome =
                    withContext(
                        Dispatchers.IO
                    ) {
                        offlineOrderQueue
                            .syncOperation(
                                request.clientOperationId
                            )
                    }

                applySyncOutcome(
                    outcome
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

    private fun syncQueuedOrder(
        clientOperationId:
            String
    ) {

        if (
            _state.value
                .placingOrder
        ) {
            return
        }

        _state.value =
            _state.value.copy(
                placingOrder = true,
                error = "",
                message =
                    "Intentando sincronizar el pedido guardado..."
            )

        viewModelScope.launch {

            try {

                val outcome =
                    withContext(
                        Dispatchers.IO
                    ) {
                        offlineOrderQueue
                            .syncOperation(
                                clientOperationId
                            )
                    }

                applySyncOutcome(
                    outcome
                )

            } catch (
                exception: Exception
            ) {

                _state.value =
                    _state.value.copy(
                        placingOrder = false,
                        error =
                            exception.message
                                ?: "No fue posible sincronizar el pedido guardado."
                    )
            }
        }
    }

    private fun applySyncOutcome(
        outcome:
            MobileOfflineSyncOutcome
    ) {

        when (
            outcome.state
        ) {

            MobileOfflineSyncState.SYNCED -> {

                val order =
                    outcome.order

                if (order == null) {
                    _state.value =
                        _state.value.copy(
                            placingOrder = false,
                            error =
                                "La sincronización finalizó sin devolver el pedido."
                        )

                    return
                }

                offlineStore.remove(
                    CustomerOfflineScope.CART
                )

                offlineOrderQueue
                    .acknowledgeSynced(
                        outcome.clientOperationId
                    )

                _state.value =
                    _state.value.copy(
                        placingOrder = false,
                        createdOrder =
                            order,
                        offlineOperationId =
                            null,
                        offlineSyncState =
                            MobileOfflineSyncState.SYNCED,
                        message =
                            "Pedido sincronizado correctamente.",
                        error = ""
                    )
            }

            MobileOfflineSyncState.PENDING -> {

                _state.value =
                    _state.value.copy(
                        placingOrder = false,
                        createdOrder =
                            null,
                        offlineOperationId =
                            outcome.clientOperationId,
                        offlineSyncState =
                            MobileOfflineSyncState.PENDING,
                        message =
                            outcome.message
                                ?: "Pedido guardado sin conexión. Se sincronizará al recuperar Internet.",
                        error = ""
                    )
            }

            MobileOfflineSyncState.CONFLICT -> {

                _state.value =
                    _state.value.copy(
                        placingOrder = false,
                        createdOrder =
                            null,
                        offlineOperationId =
                            outcome.clientOperationId,
                        offlineSyncState =
                            MobileOfflineSyncState.CONFLICT,
                        message =
                            outcome.message
                                ?: "El pedido necesita revisión antes de sincronizarse.",
                        error = ""
                    )
            }
        }
    }
}