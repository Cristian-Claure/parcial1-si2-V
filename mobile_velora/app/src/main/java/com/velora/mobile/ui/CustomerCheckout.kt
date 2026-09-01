package com.velora.mobile.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.velora.mobile.data.MobileCheckoutWarehouse
import com.velora.mobile.data.MobileCustomerAddress
import com.velora.mobile.data.MobileFulfillmentType
import com.velora.mobile.data.MobileOrder
import com.velora.mobile.data.MobileOfflineSyncState
import com.velora.mobile.ui.theme.VeloraColors

@Composable
fun CustomerCheckoutSection(
    viewModel: CheckoutViewModel,
    onBackToCart: () -> Unit,
    onContinueToPayment:
        (MobileOrder) -> Unit
) {

    val state by
        viewModel.state.collectAsState()

    Column(
        modifier =
            Modifier.fillMaxWidth()
    ) {

        Text(
            text = "FINALIZAR COMPRA",
            color =
                VeloraColors.Terracotta,
            fontWeight =
                FontWeight.Bold
        )

        Spacer(
            Modifier.height(14.dp)
        )

        when {

            state.loading -> {

                Text(
                    text =
                        "Preparando checkout...",
                    color =
                        VeloraColors.Muted
                )
            }

            state.error.isNotBlank() -> {

                VeloraFeedbackCard(
                    message =
                        state.error,
                    tone =
                        VeloraFeedbackTone.Error,
                    modifier =
                        Modifier.fillMaxWidth()
                )

                Spacer(
                    Modifier.height(10.dp)
                )
            }
        }

        if (!state.loading) {

            Text(
                text = "TIPO DE ENTREGA",
                color =
                    VeloraColors.Ink,
                fontWeight =
                    FontWeight.Bold
            )

            Spacer(
                Modifier.height(8.dp)
            )

            FulfillmentButton(
                label =
                    "ENVÍO A DOMICILIO",
                selected =
                    state.fulfillmentType ==
                        MobileFulfillmentType.DELIVERY,
                onClick = {
                    viewModel
                        .selectFulfillment(
                            MobileFulfillmentType.DELIVERY
                        )
                }
            )

            Spacer(
                Modifier.height(8.dp)
            )

            FulfillmentButton(
                label =
                    "RECOJO EN TIENDA",
                selected =
                    state.fulfillmentType ==
                        MobileFulfillmentType.PICKUP,
                onClick = {
                    viewModel
                        .selectFulfillment(
                            MobileFulfillmentType.PICKUP
                        )
                }
            )

            Spacer(
                Modifier.height(20.dp)
            )

            Text(
                text =
                    "SUCURSAL DE ABASTECIMIENTO",
                color =
                    VeloraColors.Ink,
                fontWeight =
                    FontWeight.Bold
            )

            Spacer(
                Modifier.height(8.dp)
            )

            if (
                state.warehouses.isEmpty()
            ) {

                Text(
                    text =
                        "Ninguna sucursal dispone actualmente de toda la bolsa.",
                    color =
                        VeloraColors.Error
                )

            } else {

                state.warehouses
                    .forEach {
                        warehouse ->

                        WarehouseButton(
                            warehouse =
                                warehouse,
                            selected =
                                state.selectedWarehouseId ==
                                    warehouse.warehouseId,
                            onClick = {
                                viewModel
                                    .selectWarehouse(
                                        warehouse.warehouseId
                                    )
                            }
                        )

                        Spacer(
                            Modifier.height(8.dp)
                        )
                    }
            }

            if (
                state.fulfillmentType ==
                    MobileFulfillmentType.DELIVERY
            ) {

                Spacer(
                    Modifier.height(12.dp)
                )

                Text(
                    text =
                        "DIRECCIÓN DE ENTREGA",
                    color =
                        VeloraColors.Ink,
                    fontWeight =
                        FontWeight.Bold
                )

                Spacer(
                    Modifier.height(8.dp)
                )

                if (
                    state.addresses.isEmpty()
                ) {

                    Text(
                        text =
                            "No existen direcciones registradas. Registre una dirección antes de generar el pedido.",
                        color =
                            VeloraColors.Error
                    )

                } else {

                    state.addresses
                        .forEach {
                            address ->

                            AddressButton(
                                address =
                                    address,
                                selected =
                                    state.selectedAddressId ==
                                        address.id,
                                onClick = {
                                    viewModel
                                        .selectAddress(
                                            address.id
                                        )
                                }
                            )

                            Spacer(
                                Modifier.height(8.dp)
                            )
                        }
                }
            }

            Spacer(
                Modifier.height(12.dp)
            )

            OutlinedTextField(
                value =
                    state.notes,
                onValueChange =
                    viewModel::updateNotes,
                modifier =
                    Modifier.fillMaxWidth(),
                label = {
                    Text(
                        "Observaciones"
                    )
                },
                supportingText = {
                    Text(
                        "${state.notes.length}/500"
                    )
                },
                minLines = 2,
                maxLines = 4
            )

            Spacer(
                Modifier.height(18.dp)
            )

            val createdOrder =
                state.createdOrder

            val offlineOperationId =
                state.offlineOperationId

            val offlineSyncState =
                state.offlineSyncState

            if (createdOrder != null) {

                Card(
                    modifier =
                        Modifier.fillMaxWidth(),
                    colors =
                        CardDefaults.cardColors(
                            containerColor =
                                VeloraColors.Card
                        )
                ) {

                    Column(
                        modifier =
                            Modifier.padding(
                                16.dp
                            )
                    ) {

                        Text(
                            text =
                                "PEDIDO GENERADO",
                            color =
                                VeloraColors.Terracotta,
                            fontWeight =
                                FontWeight.Bold
                        )

                        Spacer(
                            Modifier.height(6.dp)
                        )

                        Text(
                            text =
                                createdOrder.orderNumber,
                            color =
                                VeloraColors.Ink,
                            fontWeight =
                                FontWeight.Bold
                        )

                        Spacer(
                            Modifier.height(6.dp)
                        )

                        Text(
                            text =
                                "${createdOrder.currency} " +
                                    "%.2f".format(
                                        createdOrder.total
                                    ),
                            color =
                                VeloraColors.Ink
                        )

                        if (
                            state.message
                                .isNotBlank()
                        ) {

                            Spacer(
                                Modifier.height(
                                    8.dp
                                )
                            )

                            Text(
                                text =
                                    state.message,
                                color =
                                    VeloraColors.Ink
                            )
                        }

                        Spacer(
                            Modifier.height(12.dp)
                        )

                        Button(
                            modifier =
                                Modifier.fillMaxWidth(),
                            onClick = {
                                onContinueToPayment(
                                    createdOrder
                                )
                            }
                        ) {
                            Text(
                                "CONTINUAR AL PAGO"
                            )
                        }
                    }
                }

            } else if (
                !offlineOperationId
                    .isNullOrBlank() &&
                offlineSyncState != null
            ) {

                Card(
                    modifier =
                        Modifier.fillMaxWidth(),
                    colors =
                        CardDefaults.cardColors(
                            containerColor =
                                VeloraColors.Card
                        )
                ) {

                    Column(
                        modifier =
                            Modifier.padding(
                                16.dp
                            )
                    ) {

                        Text(
                            text =
                                when (
                                    offlineSyncState
                                ) {
                                    MobileOfflineSyncState.PENDING ->
                                        "PEDIDO GUARDADO SIN CONEXIÓN"

                                    MobileOfflineSyncState.CONFLICT ->
                                        "PEDIDO REQUIERE REVISIÓN"

                                    MobileOfflineSyncState.SYNCED ->
                                        "PEDIDO SINCRONIZADO"
                                },
                            color =
                                VeloraColors.Terracotta,
                            fontWeight =
                                FontWeight.Bold
                        )

                        Spacer(
                            Modifier.height(
                                8.dp
                            )
                        )

                        Text(
                            text =
                                when (
                                    offlineSyncState
                                ) {
                                    MobileOfflineSyncState.PENDING ->
                                        "El pedido está guardado de forma segura en este dispositivo. Todavía no reservó stock ni procesó ningún pago."

                                    MobileOfflineSyncState.CONFLICT ->
                                        "El servidor no pudo confirmar el pedido con el snapshot guardado. Revise el detalle antes de continuar."

                                    MobileOfflineSyncState.SYNCED ->
                                        "El pedido fue sincronizado correctamente."
                                },
                            color =
                                VeloraColors.Ink
                        )

                        if (
                            state.message
                                .isNotBlank()
                        ) {

                            Spacer(
                                Modifier.height(
                                    8.dp
                                )
                            )

                            Text(
                                text =
                                    state.message,
                                color =
                                    VeloraColors.Ink
                            )
                        }

                        Spacer(
                            Modifier.height(
                                6.dp
                            )
                        )

                        Text(
                            text =
                                "Operación: " +
                                    offlineOperationId,
                            color =
                                VeloraColors.Ink
                        )

                        Spacer(
                            Modifier.height(
                                14.dp
                            )
                        )

                        when (
                            offlineSyncState
                        ) {

                            MobileOfflineSyncState.PENDING -> {

                                Button(
                                    modifier =
                                        Modifier.fillMaxWidth(),
                                    enabled =
                                        !state.placingOrder,
                                    onClick =
                                        viewModel::placeOrder
                                ) {

                                    Text(
                                        if (
                                            state.placingOrder
                                        ) {
                                            "SINCRONIZANDO..."
                                        }
                                        else {
                                            "REINTENTAR SINCRONIZACIÓN"
                                        }
                                    )
                                }
                            }

                            MobileOfflineSyncState.CONFLICT -> {

                                Button(
                                    modifier =
                                        Modifier.fillMaxWidth(),
                                    enabled =
                                        !state.placingOrder,
                                    onClick =
                                        viewModel::retryOfflineConflict
                                ) {

                                    Text(
                                        if (
                                            state.placingOrder
                                        ) {
                                            "REINTENTANDO..."
                                        }
                                        else {
                                            "REINTENTAR PEDIDO"
                                        }
                                    )
                                }
                            }

                            MobileOfflineSyncState.SYNCED -> {
                            }
                        }

                        if (
                            offlineSyncState !=
                                MobileOfflineSyncState.SYNCED
                        ) {

                            Spacer(
                                Modifier.height(
                                    8.dp
                                )
                            )

                            OutlinedButton(
                                modifier =
                                    Modifier.fillMaxWidth(),
                                enabled =
                                    !state.placingOrder,
                                onClick =
                                    viewModel::discardOfflineOrder
                            ) {

                                Text(
                                    "DESCARTAR PEDIDO GUARDADO"
                                )
                            }

                            Spacer(
                                Modifier.height(
                                    6.dp
                                )
                            )

                            Text(
                                text =
                                    "Al descartarlo, la bolsa guardada se conserva para que pueda revisarla y generar un nuevo pedido.",
                                color =
                                    VeloraColors.Ink
                            )
                        }
                    }
                }

            } else {

                if (
                    state.message
                        .isNotBlank()
                ) {

                    Card(
                        modifier =
                            Modifier.fillMaxWidth(),
                        colors =
                            CardDefaults.cardColors(
                                containerColor =
                                    VeloraColors.Card
                            )
                    ) {

                        Text(
                            text =
                                state.message,
                            color =
                                VeloraColors.Ink,
                            modifier =
                                Modifier.padding(
                                    14.dp
                                )
                        )
                    }

                    Spacer(
                        Modifier.height(
                            10.dp
                        )
                    )
                }

                Button(
                    modifier =
                        Modifier.fillMaxWidth(),
                    enabled =
                        !state.placingOrder &&
                        state.warehouses
                            .isNotEmpty() &&
                        (
                            state.fulfillmentType ==
                                MobileFulfillmentType.PICKUP ||
                            state.selectedAddressId !=
                                null
                        ),
                    onClick =
                        viewModel::placeOrder
                ) {

                    Text(
                        if (
                            state.placingOrder
                        ) {
                            "GENERANDO..."
                        }
                        else {
                            "GENERAR PEDIDO"
                        }
                    )
                }
            }

            Spacer(
                Modifier.height(8.dp)
            )
        }

        OutlinedButton(
            modifier =
                Modifier.fillMaxWidth(),
            enabled =
                !state.placingOrder,
            onClick =
                onBackToCart
        ) {
            Text(
                "VOLVER A LA BOLSA"
            )
        }
    }
}

@Composable
private fun FulfillmentButton(
    label: String,
    selected: Boolean,
    onClick: () -> Unit
) {

    if (selected) {

        Button(
            modifier =
                Modifier.fillMaxWidth(),
            onClick =
                onClick
        ) {
            Text(label)
        }

    } else {

        OutlinedButton(
            modifier =
                Modifier.fillMaxWidth(),
            onClick =
                onClick
        ) {
            Text(label)
        }
    }
}

@Composable
private fun WarehouseButton(
    warehouse:
        MobileCheckoutWarehouse,
    selected: Boolean,
    onClick: () -> Unit
) {

    val label =
        buildString {

            append(
                warehouse.storeName
            )

            append(" · ")

            append(
                warehouse.warehouseName
            )

            warehouse.storeAddress
                ?.takeIf {
                    it.isNotBlank()
                }
                ?.let {
                    append("\n")
                    append(it)
                }
        }

    if (selected) {

        Button(
            modifier =
                Modifier.fillMaxWidth(),
            onClick =
                onClick
        ) {
            Text(label)
        }

    } else {

        OutlinedButton(
            modifier =
                Modifier.fillMaxWidth(),
            onClick =
                onClick
        ) {
            Text(label)
        }
    }
}

@Composable
private fun AddressButton(
    address:
        MobileCustomerAddress,
    selected: Boolean,
    onClick: () -> Unit
) {

    val label =
        buildString {

            append(
                address.label
            )

            if (
                address.defaultAddress
            ) {
                append(" · PREDETERMINADA")
            }

            append("\n")

            append(
                address.addressLine
            )

            append(", ")

            append(
                address.city
            )
        }

    if (selected) {

        Button(
            modifier =
                Modifier.fillMaxWidth(),
            onClick =
                onClick
        ) {
            Text(label)
        }

    } else {

        OutlinedButton(
            modifier =
                Modifier.fillMaxWidth(),
            onClick =
                onClick
        ) {
            Text(label)
        }
    }
}