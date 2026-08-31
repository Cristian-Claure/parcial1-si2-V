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
import com.velora.mobile.data.MobileOrder
import com.velora.mobile.data.MobilePaymentMethod
import com.velora.mobile.data.MobilePaymentStatus
import com.velora.mobile.ui.theme.VeloraColors

@Composable
fun CustomerPaymentSection(
    order: MobileOrder,
    viewModel: PaymentViewModel,
    onBackToOrder: () -> Unit,
    onPaymentCompleted: () -> Unit
) {
    val state by
        viewModel.state.collectAsState()

    val pendingIntent =
        state.intent
            ?.takeIf {
                it.payment.status ==
                    MobilePaymentStatus.PENDING
            }

    Column(
        modifier =
            Modifier.fillMaxWidth()
    ) {
        Text(
            text = "PAGO ONLINE",
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
                "Pedido ${order.orderNumber}",
            color =
                VeloraColors.Ink
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

        Spacer(
            Modifier.height(14.dp)
        )

        if (
            state.error.isNotBlank()
        ) {
            Text(
                text = state.error,
                color =
                    VeloraColors.Error
            )

            Spacer(
                Modifier.height(10.dp)
            )
        }

        if (
            state.success.isNotBlank()
        ) {
            Text(
                text = state.success,
                color =
                    VeloraColors.Terracotta
            )

            Spacer(
                Modifier.height(10.dp)
            )
        }

        val paid =
            state.paidPayment

        if (paid != null) {

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
                            18.dp
                        )
                ) {
                    Text(
                        text =
                            "PAGO CONFIRMADO",
                        color =
                            VeloraColors.Terracotta,
                        fontWeight =
                            FontWeight.Bold
                    )

                    Spacer(
                        Modifier.height(8.dp)
                    )

                    Text(
                        text =
                            "Método: ${paid.method.name}",
                        color =
                            VeloraColors.Ink
                    )

                    Text(
                        text =
                            "Total: ${paid.currency} " +
                                "%.2f".format(
                                    paid.amount
                                ),
                        color =
                            VeloraColors.Ink
                    )

                    Text(
                        text =
                            "Estado: ${paid.status.name}",
                        color =
                            VeloraColors.Ink
                    )

                    Spacer(
                        Modifier.height(14.dp)
                    )

                    Button(
                        modifier =
                            Modifier.fillMaxWidth(),
                        onClick =
                            onPaymentCompleted
                    ) {
                        Text("CONTINUAR")
                    }
                }
            }

        } else {

            Text(
                text =
                    "MÉTODO DE PAGO",
                color =
                    VeloraColors.Ink,
                fontWeight =
                    FontWeight.Bold
            )

            Spacer(
                Modifier.height(8.dp)
            )

            PaymentMethodButton(
                text = "TARJETA",
                selected =
                    state.method ==
                        MobilePaymentMethod.CARD,
                enabled =
                    !state.busy &&
                    pendingIntent == null,
                onClick = {
                    viewModel.selectMethod(
                        MobilePaymentMethod.CARD
                    )
                }
            )

            Spacer(
                Modifier.height(8.dp)
            )

            PaymentMethodButton(
                text = "QR",
                selected =
                    state.method ==
                        MobilePaymentMethod.QR,
                enabled =
                    !state.busy &&
                    pendingIntent == null,
                onClick = {
                    viewModel.selectMethod(
                        MobilePaymentMethod.QR
                    )
                }
            )

            Spacer(
                Modifier.height(18.dp)
            )

            if (
                pendingIntent == null &&
                state.method ==
                    MobilePaymentMethod.CARD
            ) {
                OutlinedTextField(
                    value =
                        state.holder,
                    onValueChange =
                        viewModel::updateHolder,
                    modifier =
                        Modifier.fillMaxWidth(),
                    label = {
                        Text("Titular")
                    },
                    singleLine = true
                )

                Spacer(
                    Modifier.height(8.dp)
                )

                OutlinedTextField(
                    value =
                        state.cardNumber,
                    onValueChange =
                        viewModel::updateCardNumber,
                    modifier =
                        Modifier.fillMaxWidth(),
                    label = {
                        Text(
                            "Número de tarjeta"
                        )
                    },
                    singleLine = true
                )

                Spacer(
                    Modifier.height(8.dp)
                )

                OutlinedTextField(
                    value =
                        state.expiry,
                    onValueChange =
                        viewModel::updateExpiry,
                    modifier =
                        Modifier.fillMaxWidth(),
                    label = {
                        Text(
                            "Vencimiento MM/AA"
                        )
                    },
                    singleLine = true
                )

                Spacer(
                    Modifier.height(8.dp)
                )

                OutlinedTextField(
                    value =
                        state.cvv,
                    onValueChange =
                        viewModel::updateCvv,
                    modifier =
                        Modifier.fillMaxWidth(),
                    label = {
                        Text("CVV")
                    },
                    singleLine = true
                )

                Spacer(
                    Modifier.height(10.dp)
                )

                Text(
                    text =
                        "El número completo y el CVV no se almacenan en VÉLORA.",
                    color =
                        VeloraColors.Muted
                )

                Spacer(
                    Modifier.height(14.dp)
                )

                Button(
                    modifier =
                        Modifier.fillMaxWidth(),
                    enabled =
                        !state.busy,
                    onClick = {
                        viewModel.payCard(
                            order.id
                        )
                    }
                ) {
                    Text(
                        if (state.busy) {
                            "PROCESANDO..."
                        } else {
                            "PAGAR ${order.currency} " +
                                "%.2f".format(
                                    order.total
                                )
                        }
                    )
                }
            }

            if (
                pendingIntent == null &&
                state.method ==
                    MobilePaymentMethod.QR
            ) {
                Text(
                    text =
                        "El QR se genera por el importe exacto del pedido.",
                    color =
                        VeloraColors.Muted
                )

                Spacer(
                    Modifier.height(12.dp)
                )

                Button(
                    modifier =
                        Modifier.fillMaxWidth(),
                    enabled =
                        !state.busy,
                    onClick = {
                        viewModel.generateQr(
                            order.id
                        )
                    }
                ) {
                    Text(
                        if (state.busy) {
                            "GENERANDO..."
                        } else {
                            "GENERAR QR"
                        }
                    )
                }
            }

            if (
                pendingIntent != null
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
                                if (
                                    pendingIntent
                                        .payment
                                        .method ==
                                        MobilePaymentMethod.QR
                                ) {
                                    "QR DE PAGO"
                                } else {
                                    "PAGO CON TARJETA"
                                },
                            color =
                                VeloraColors.Terracotta,
                            fontWeight =
                                FontWeight.Bold
                        )

                        Spacer(
                            Modifier.height(8.dp)
                        )

                        Text(
                            text =
                                "${pendingIntent.payment.currency} " +
                                    "%.2f".format(
                                        pendingIntent
                                            .payment
                                            .amount
                                    ),
                            color =
                                VeloraColors.Ink,
                            fontWeight =
                                FontWeight.Bold
                        )

                        if (
                            pendingIntent.payment.method ==
                                MobilePaymentMethod.QR
                        ) {
                            Spacer(
                                Modifier.height(12.dp)
                            )

                            Text(
                                text = "Contenido QR:",
                                color =
                                    VeloraColors.Muted
                            )

                            Spacer(
                                Modifier.height(5.dp)
                            )

                            Text(
                                text =
                                    pendingIntent
                                        .qrPayload
                                        ?: "QR no disponible.",
                                color =
                                    VeloraColors.Ink
                            )

                            pendingIntent
                                .expiresAt
                                ?.let {
                                    Spacer(
                                        Modifier.height(6.dp)
                                    )

                                    Text(
                                        text = "Vence: $it",
                                        color =
                                            VeloraColors.Muted
                                    )
                                }

                            if (
                                viewModel.qrExpired()
                            ) {
                                Spacer(
                                    Modifier.height(8.dp)
                                )

                                Text(
                                    text =
                                        "Este QR ya expiró.",
                                    color =
                                        VeloraColors.Error
                                )
                            }
                        }

                        Spacer(
                            Modifier.height(14.dp)
                        )

                        Button(
                            modifier =
                                Modifier.fillMaxWidth(),
                            enabled =
                                !state.busy &&
                                !(
                                    pendingIntent
                                        .payment
                                        .method ==
                                        MobilePaymentMethod.QR &&
                                    viewModel.qrExpired()
                                ),
                            onClick =
                                viewModel::confirmCurrentIntent
                        ) {
                            Text(
                                if (state.busy) {
                                    "VERIFICANDO..."
                                } else if (
                                    pendingIntent
                                        .payment
                                        .method ==
                                        MobilePaymentMethod.QR
                                ) {
                                    "SIMULAR PAGO REALIZADO"
                                } else {
                                    "REINTENTAR CONFIRMACIÓN"
                                }
                            )
                        }

                        Spacer(
                            Modifier.height(8.dp)
                        )

                        OutlinedButton(
                            modifier =
                                Modifier.fillMaxWidth(),
                            enabled =
                                !state.busy,
                            onClick =
                                viewModel::cancelCurrentIntent
                        ) {
                            Text(
                                "CANCELAR INTENTO"
                            )
                        }
                    }
                }
            }
        }

        Spacer(
            Modifier.height(10.dp)
        )

        if (
            state.paidPayment == null
        ) {
            OutlinedButton(
                modifier =
                    Modifier.fillMaxWidth(),
                enabled =
                    !state.busy,
                onClick =
                    onBackToOrder
            ) {
                Text(
                    "VOLVER AL PEDIDO"
                )
            }
        }
    }
}

@Composable
private fun PaymentMethodButton(
    text: String,
    selected: Boolean,
    enabled: Boolean,
    onClick: () -> Unit
) {
    if (selected) {
        Button(
            modifier =
                Modifier.fillMaxWidth(),
            enabled = enabled,
            onClick = onClick
        ) {
            Text(text)
        }
    } else {
        OutlinedButton(
            modifier =
                Modifier.fillMaxWidth(),
            enabled = enabled,
            onClick = onClick
        ) {
            Text(text)
        }
    }
}