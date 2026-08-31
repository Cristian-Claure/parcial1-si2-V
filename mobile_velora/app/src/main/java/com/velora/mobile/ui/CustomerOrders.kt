package com.velora.mobile.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.velora.mobile.data.MobileFulfillmentType
import com.velora.mobile.data.MobileOrder
import com.velora.mobile.data.MobileOrderStatus
import com.velora.mobile.ui.theme.VeloraColors

@Composable
fun CustomerOrdersSection(
    viewModel: OrdersViewModel,
    onBackToCatalog: () -> Unit
) {

    val state by
        viewModel.state.collectAsState()

    var pendingCancellation by
        remember {
            mutableStateOf<MobileOrder?>(
                null
            )
        }

    Column(
        modifier =
            Modifier.fillMaxWidth()
    ) {

        Text(
            text = "MIS PEDIDOS",
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
                "Consulte el estado y detalle de sus compras.",
            color =
                VeloraColors.Muted
        )

        Spacer(
            Modifier.height(18.dp)
        )

        when {

            state.loading -> {

                Text(
                    text =
                        "Cargando pedidos...",
                    color =
                        VeloraColors.Muted
                )
            }

            state.error.isNotBlank() -> {

                Text(
                    text =
                        state.error,
                    color =
                        VeloraColors.Error
                )

                Spacer(
                    Modifier.height(8.dp)
                )

                TextButton(
                    onClick =
                        viewModel::load
                ) {
                    Text("REINTENTAR")
                }
            }

            state.orders.isEmpty() -> {

                Text(
                    text =
                        "Todavía no existen pedidos registrados.",
                    color =
                        VeloraColors.Muted
                )
            }

            else -> {

                state.orders.forEach {
                    order ->

                    OrderCard(
                        order = order,
                        cancelling =
                            state.cancellingOrderId ==
                                order.id,
                        onCancel = {
                            pendingCancellation =
                                order
                        }
                    )

                    Spacer(
                        Modifier.height(
                            12.dp
                        )
                    )
                }
            }
        }

        if (
            state.message.isNotBlank()
        ) {

            Spacer(
                Modifier.height(8.dp)
            )

            Text(
                text =
                    state.message,
                color =
                    VeloraColors.Terracotta,
                fontWeight =
                    FontWeight.Bold
            )
        }

        Spacer(
            Modifier.height(18.dp)
        )

        OutlinedButton(
            modifier =
                Modifier.fillMaxWidth(),
            onClick =
                viewModel::load
        ) {
            Text(
                "ACTUALIZAR PEDIDOS"
            )
        }

        Spacer(
            Modifier.height(8.dp)
        )

        OutlinedButton(
            modifier =
                Modifier.fillMaxWidth(),
            onClick =
                onBackToCatalog
        ) {
            Text(
                "VOLVER AL CATÁLOGO"
            )
        }
    }

    val orderToCancel =
        pendingCancellation

    if (orderToCancel != null) {

        AlertDialog(
            onDismissRequest = {
                pendingCancellation =
                    null
            },
            title = {
                Text(
                    "Cancelar pedido"
                )
            },
            text = {
                Text(
                    "¿Confirma la cancelación del pedido " +
                        "${orderToCancel.orderNumber}?"
                )
            },
            confirmButton = {

                TextButton(
                    onClick = {

                        pendingCancellation =
                            null

                        viewModel.cancel(
                            orderToCancel.id
                        )
                    }
                ) {
                    Text(
                        "SÍ, CANCELAR"
                    )
                }
            },
            dismissButton = {

                TextButton(
                    onClick = {
                        pendingCancellation =
                            null
                    }
                ) {
                    Text(
                        "VOLVER"
                    )
                }
            }
        )
    }
}

@Composable
private fun OrderCard(
    order: MobileOrder,
    cancelling: Boolean,
    onCancel: () -> Unit
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

            Row(
                modifier =
                    Modifier.fillMaxWidth(),
                horizontalArrangement =
                    Arrangement.SpaceBetween
            ) {

                Text(
                    text =
                        order.orderNumber,
                    color =
                        VeloraColors.Ink,
                    fontWeight =
                        FontWeight.Bold
                )

                Text(
                    text =
                        orderStatusLabel(
                            order.status
                        ),
                    color =
                        VeloraColors.Terracotta,
                    fontWeight =
                        FontWeight.Bold
                )
            }

            Spacer(
                Modifier.height(8.dp)
            )

            OrderLabel(
                label = "Sucursal",
                value = order.storeName
            )

            OrderLabel(
                label = "Entrega",
                value =
                    fulfillmentLabel(
                        order.fulfillmentType
                    )
            )

            OrderLabel(
                label = "Fecha",
                value =
                    order.createdAt
                        .take(10)
            )

            if (
                order.fulfillmentType ==
                    MobileFulfillmentType.DELIVERY
            ) {

                val address =
                    listOfNotNull(
                        order.addressLine,
                        order.zone,
                        order.city
                    )
                        .filter {
                            it.isNotBlank()
                        }
                        .joinToString(
                            ", "
                        )

                if (
                    address.isNotBlank()
                ) {
                    OrderLabel(
                        label =
                            "Dirección",
                        value =
                            address
                    )
                }
            }

            Spacer(
                Modifier.height(10.dp)
            )

            Text(
                text = "PRODUCTOS",
                color =
                    VeloraColors.Muted,
                fontWeight =
                    FontWeight.Bold
            )

            Spacer(
                Modifier.height(5.dp)
            )

            order.items.forEach {
                item ->

                Text(
                    text =
                        "${item.quantity} × " +
                            "${item.productName} · " +
                            "${item.color} · " +
                            item.size,
                    color =
                        VeloraColors.Ink
                )

                Text(
                    text =
                        "${item.currency} " +
                            "%.2f".format(
                                item.subtotal
                            ),
                    color =
                        VeloraColors.Muted
                )

                Spacer(
                    Modifier.height(5.dp)
                )
            }

            Spacer(
                Modifier.height(8.dp)
            )

            Row(
                modifier =
                    Modifier.fillMaxWidth(),
                horizontalArrangement =
                    Arrangement.SpaceBetween
            ) {

                Text(
                    text = "TOTAL",
                    color =
                        VeloraColors.Muted
                )

                Text(
                    text =
                        "${order.currency} " +
                            "%.2f".format(
                                order.total
                            ),
                    color =
                        VeloraColors.Ink,
                    fontWeight =
                        FontWeight.Bold
                )
            }

            if (
                order.status ==
                    MobileOrderStatus.RESERVED
            ) {

                Spacer(
                    Modifier.height(12.dp)
                )

                OutlinedButton(
                    modifier =
                        Modifier.fillMaxWidth(),
                    enabled =
                        !cancelling,
                    onClick =
                        onCancel
                ) {

                    Text(
                        if (cancelling) {
                            "CANCELANDO..."
                        } else {
                            "CANCELAR PEDIDO"
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun OrderLabel(
    label: String,
    value: String
) {

    Row(
        modifier =
            Modifier.fillMaxWidth(),
        horizontalArrangement =
            Arrangement.SpaceBetween
    ) {

        Text(
            text = label,
            color =
                VeloraColors.Muted
        )

        Text(
            text = value,
            color =
                VeloraColors.Ink
        )
    }

    Spacer(
        Modifier.height(4.dp)
    )
}

private fun orderStatusLabel(
    status: MobileOrderStatus
): String {

    return when (status) {

        MobileOrderStatus.RESERVED ->
            "Reservado"

        MobileOrderStatus.FULFILLED ->
            "Entregado"

        MobileOrderStatus.CANCELLED ->
            "Cancelado"
    }
}

private fun fulfillmentLabel(
    type: MobileFulfillmentType
): String {

    return when (type) {

        MobileFulfillmentType.DELIVERY ->
            "Envío a domicilio"

        MobileFulfillmentType.PICKUP ->
            "Recojo en tienda"

        MobileFulfillmentType.IN_STORE ->
            "Compra en tienda"
    }
}