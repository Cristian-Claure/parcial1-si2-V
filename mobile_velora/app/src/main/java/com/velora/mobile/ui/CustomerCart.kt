package com.velora.mobile.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedIconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.velora.mobile.data.MobileCartItem
import com.velora.mobile.ui.theme.VeloraColors

@Composable
fun CustomerCartSection(
    viewModel: CartViewModel,
    onCheckout: () -> Unit
) {

    val state by
        viewModel.state.collectAsState()

    Column(
        modifier =
            Modifier.fillMaxWidth()
    ) {

        Text(
            text = "MI BOLSA",
            color =
                VeloraColors.Terracotta,
            fontWeight =
                FontWeight.Bold,
            style =
                MaterialTheme
                    .typography
                    .labelMedium
        )

        Spacer(
            Modifier.height(6.dp)
        )

        Text(
            text = "Su selección.",
            color =
                VeloraColors.Ink,
            style =
                MaterialTheme
                    .typography
                    .headlineLarge
        )

        Spacer(
            Modifier.height(7.dp)
        )

        Text(
            text =
                "Revise variantes y cantidades antes de reservar su pedido.",
            color =
                VeloraColors.Muted,
            style =
                MaterialTheme
                    .typography
                    .bodyMedium
        )

        if (
            state.message.isNotBlank()
        ) {

            Spacer(
                Modifier.height(16.dp)
            )

            CartFeedback(
                message =
                    state.message,
                error = false
            )
        }

        Spacer(
            Modifier.height(20.dp)
        )

        when {

            state.loading -> {

                CartLoadingState()
            }

            state.error.isNotBlank() -> {

                CartFeedback(
                    message =
                        state.error,
                    error = true
                )

                Spacer(
                    Modifier.height(10.dp)
                )

                OutlinedButton(
                    modifier =
                        Modifier.fillMaxWidth(),
                    onClick =
                        viewModel::load
                ) {
                    Text("REINTENTAR")
                }
            }

            state.cart.items.isEmpty() -> {

                CartEmptyState()
            }

            else -> {

                Row(
                    modifier =
                        Modifier.fillMaxWidth(),
                    horizontalArrangement =
                        Arrangement.SpaceBetween,
                    verticalAlignment =
                        Alignment.CenterVertically
                ) {

                    Text(
                        text =
                            if (
                                state.cart.totalItems ==
                                    1
                            ) {
                                "1 pieza"
                            } else {
                                "${state.cart.totalItems} piezas"
                            },
                        color =
                            VeloraColors.Muted,
                        style =
                            MaterialTheme
                                .typography
                                .bodyMedium
                    )

                    Text(
                        text =
                            "Bolsa activa",
                        color =
                            VeloraColors.Terracotta,
                        fontWeight =
                            FontWeight.SemiBold,
                        style =
                            MaterialTheme
                                .typography
                                .labelMedium
                    )
                }

                Spacer(
                    Modifier.height(12.dp)
                )

                Column(
                    verticalArrangement =
                        Arrangement.spacedBy(
                            12.dp
                        )
                ) {

                    state.cart.items
                        .forEach { item ->

                            CartItemCard(
                                item =
                                    item,
                                busy =
                                    state.busyItemId ==
                                        item.id,
                                onDecrease = {
                                    viewModel.decrease(
                                        item.id,
                                        item.quantity
                                    )
                                },
                                onIncrease = {
                                    viewModel.increase(
                                        item.id,
                                        item.quantity
                                    )
                                },
                                onRemove = {
                                    viewModel.remove(
                                        item.id
                                    )
                                }
                            )
                        }
                }

                Spacer(
                    Modifier.height(18.dp)
                )

                CartSummary(
                    totalItems =
                        state.cart.totalItems,
                    currency =
                        state.cart.currency,
                    subtotal =
                        state.cart.subtotal,
                    clearing =
                        state.clearing,
                    itemBusy =
                        state.busyItemId !=
                            null,
                    onCheckout =
                        onCheckout,
                    onClear =
                        viewModel::clear
                )
            }
        }
    }
}

@Composable
private fun CartLoadingState() {

    Card(
        modifier =
            Modifier.fillMaxWidth(),
        shape =
            MaterialTheme
                .shapes
                .large,
        colors =
            CardDefaults.cardColors(
                containerColor =
                    VeloraColors.Card
            ),
        border =
            BorderStroke(
                1.dp,
                VeloraColors.Border
            )
    ) {

        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(
                        22.dp
                    ),
            verticalAlignment =
                Alignment.CenterVertically
        ) {

            CircularProgressIndicator(
                modifier =
                    Modifier.size(
                        24.dp
                    ),
                color =
                    VeloraColors.Terracotta,
                strokeWidth =
                    2.dp
            )

            Spacer(
                Modifier.width(14.dp)
            )

            Column {

                Text(
                    text =
                        "Preparando su bolsa",
                    color =
                        VeloraColors.Ink,
                    fontWeight =
                        FontWeight.SemiBold
                )

                Spacer(
                    Modifier.height(3.dp)
                )

                Text(
                    text =
                        "Cargando su selección...",
                    color =
                        VeloraColors.Muted,
                    style =
                        MaterialTheme
                            .typography
                            .bodySmall
                )
            }
        }
    }
}

@Composable
private fun CartEmptyState() {

    Card(
        modifier =
            Modifier.fillMaxWidth(),
        shape =
            MaterialTheme
                .shapes
                .large,
        colors =
            CardDefaults.cardColors(
                containerColor =
                    VeloraColors.Card
            ),
        border =
            BorderStroke(
                1.dp,
                VeloraColors.Border
            )
    ) {

        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(
                        vertical =
                            42.dp,
                        horizontal =
                            24.dp
                    ),
            horizontalAlignment =
                Alignment.CenterHorizontally
        ) {

            Surface(
                modifier =
                    Modifier.size(
                        56.dp
                    ),
                shape =
                    MaterialTheme
                        .shapes
                        .large,
                color =
                    VeloraColors.SurfaceSoft,
                border =
                    BorderStroke(
                        1.dp,
                        VeloraColors.Champagne
                    )
            ) {

                Column(
                    modifier =
                        Modifier.fillMaxWidth(),
                    verticalArrangement =
                        Arrangement.Center,
                    horizontalAlignment =
                        Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "V",
                        color =
                            VeloraColors.Terracotta,
                        style =
                            MaterialTheme
                                .typography
                                .headlineMedium
                    )
                }
            }

            Spacer(
                Modifier.height(16.dp)
            )

            Text(
                text =
                    "BOLSA VACÍA",
                color =
                    VeloraColors.Terracotta,
                fontWeight =
                    FontWeight.Bold,
                style =
                    MaterialTheme
                        .typography
                        .labelMedium
            )

            Spacer(
                Modifier.height(8.dp)
            )

            Text(
                text =
                    "Encuentre una pieza para comenzar.",
                color =
                    VeloraColors.Ink,
                style =
                    MaterialTheme
                        .typography
                        .headlineMedium
            )

            Spacer(
                Modifier.height(8.dp)
            )

            Text(
                text =
                    "Use el acceso al catálogo para elegir color y talla.",
                color =
                    VeloraColors.Muted,
                style =
                    MaterialTheme
                        .typography
                        .bodyMedium
            )
        }
    }
}

@Composable
private fun CartFeedback(
    message: String,
    error: Boolean
) {

    Surface(
        modifier =
            Modifier.fillMaxWidth(),
        shape =
            MaterialTheme
                .shapes
                .medium,
        color =
            if (error) {
                VeloraColors.Error
                    .copy(
                        alpha = .08f
                    )
            } else {
                VeloraColors.SurfaceSoft
            },
        border =
            BorderStroke(
                1.dp,
                if (error) {
                    VeloraColors.Error
                        .copy(
                            alpha = .32f
                        )
                } else {
                    VeloraColors.Border
                }
            )
    ) {

        Row(
            modifier =
                Modifier.padding(
                    14.dp
                ),
            verticalAlignment =
                Alignment.Top
        ) {

            Text(
                text =
                    if (error) {
                        "!"
                    } else {
                        "i"
                    },
                color =
                    if (error) {
                        VeloraColors.Error
                    } else {
                        VeloraColors.Terracotta
                    },
                fontWeight =
                    FontWeight.Bold
            )

            Spacer(
                Modifier.width(10.dp)
            )

            Text(
                text =
                    message,
                color =
                    if (error) {
                        VeloraColors.Error
                    } else {
                        VeloraColors.InkSoft
                    },
                style =
                    MaterialTheme
                        .typography
                        .bodySmall
            )
        }
    }
}

@Composable
private fun CartItemCard(
    item: MobileCartItem,
    busy: Boolean,
    onDecrease: () -> Unit,
    onIncrease: () -> Unit,
    onRemove: () -> Unit
) {

    Card(
        modifier =
            Modifier.fillMaxWidth(),
        shape =
            MaterialTheme
                .shapes
                .large,
        colors =
            CardDefaults.cardColors(
                containerColor =
                    VeloraColors.Card
            ),
        border =
            BorderStroke(
                1.dp,
                if (busy) {
                    VeloraColors.Champagne
                } else {
                    VeloraColors.Border
                }
            ),
        elevation =
            CardDefaults
                .cardElevation(
                    defaultElevation =
                        1.dp
                )
    ) {

        Column(
            modifier =
                Modifier.padding(
                    18.dp
                )
        ) {

            Row(
                modifier =
                    Modifier.fillMaxWidth(),
                horizontalArrangement =
                    Arrangement.SpaceBetween,
                verticalAlignment =
                    Alignment.Top
            ) {

                Column(
                    modifier =
                        Modifier.weight(
                            1f
                        )
                ) {

                    Text(
                        text =
                            item.sku,
                        color =
                            VeloraColors.Terracotta,
                        fontWeight =
                            FontWeight.Bold,
                        style =
                            MaterialTheme
                                .typography
                                .labelSmall
                    )

                    Spacer(
                        Modifier.height(5.dp)
                    )

                    Text(
                        text =
                            item.productName,
                        color =
                            VeloraColors.Ink,
                        style =
                            MaterialTheme
                                .typography
                                .headlineSmall
                    )
                }

                Spacer(
                    Modifier.width(14.dp)
                )

                Column(
                    horizontalAlignment =
                        Alignment.End
                ) {

                    Text(
                        text =
                            "SUBTOTAL",
                        color =
                            VeloraColors.MutedLight,
                        fontWeight =
                            FontWeight.Bold,
                        style =
                            MaterialTheme
                                .typography
                                .labelSmall
                    )

                    Text(
                        text =
                            "${item.currency} " +
                                "%.2f".format(
                                    item.subtotal
                                ),
                        color =
                            VeloraColors.Ink,
                        fontWeight =
                            FontWeight.SemiBold
                    )
                }
            }

            Spacer(
                Modifier.height(12.dp)
            )

            Row(
                horizontalArrangement =
                    Arrangement.spacedBy(
                        8.dp
                    )
            ) {

                VariantPill(
                    label =
                        item.color
                )

                VariantPill(
                    label =
                        "Talla ${item.size}"
                )
            }

            Spacer(
                Modifier.height(13.dp)
            )

            Text(
                text =
                    "Precio unitario · " +
                        item.currency +
                        " " +
                        "%.2f".format(
                            item.unitPrice
                        ),
                color =
                    VeloraColors.Muted,
                style =
                    MaterialTheme
                        .typography
                        .bodySmall
            )

            Spacer(
                Modifier.height(14.dp)
            )

            HorizontalDivider(
                color =
                    VeloraColors.Border
            )

            Spacer(
                Modifier.height(12.dp)
            )

            Row(
                modifier =
                    Modifier.fillMaxWidth(),
                horizontalArrangement =
                    Arrangement.SpaceBetween,
                verticalAlignment =
                    Alignment.CenterVertically
            ) {

                Row(
                    verticalAlignment =
                        Alignment.CenterVertically
                ) {

                    OutlinedIconButton(
                        enabled =
                            !busy &&
                                item.quantity >
                                    1,
                        onClick =
                            onDecrease,
                        border =
                            BorderStroke(
                                1.dp,
                                VeloraColors.BorderStrong
                            )
                    ) {
                        Text("−")
                    }

                    Text(
                        text =
                            item.quantity
                                .toString(),
                        modifier =
                            Modifier.padding(
                                horizontal =
                                    14.dp
                            ),
                        color =
                            VeloraColors.Ink,
                        fontWeight =
                            FontWeight.Bold
                    )

                    OutlinedIconButton(
                        enabled =
                            !busy &&
                                item.quantity <
                                    99,
                        onClick =
                            onIncrease,
                        border =
                            BorderStroke(
                                1.dp,
                                VeloraColors.BorderStrong
                            )
                    ) {
                        Text("+")
                    }
                }

                TextButton(
                    enabled =
                        !busy,
                    onClick =
                        onRemove,
                    colors =
                        ButtonDefaults
                            .textButtonColors(
                                contentColor =
                                    VeloraColors.Error
                            )
                ) {
                    Text("QUITAR")
                }
            }

            if (busy) {

                Spacer(
                    Modifier.height(6.dp)
                )

                Text(
                    text =
                        "Actualizando selección...",
                    color =
                        VeloraColors.Terracotta,
                    style =
                        MaterialTheme
                            .typography
                            .labelSmall
                )
            }
        }
    }
}

@Composable
private fun VariantPill(
    label: String
) {

    Surface(
        shape =
            MaterialTheme
                .shapes
                .small,
        color =
            VeloraColors.SurfaceSoft,
        border =
            BorderStroke(
                1.dp,
                VeloraColors.Border
            )
    ) {

        Text(
            text =
                label,
            modifier =
                Modifier.padding(
                    horizontal =
                        10.dp,
                    vertical =
                        6.dp
                ),
            color =
                VeloraColors.InkSoft,
            style =
                MaterialTheme
                    .typography
                    .labelMedium
        )
    }
}

@Composable
private fun CartSummary(
    totalItems: Int,
    currency: String,
    subtotal: Double,
    clearing: Boolean,
    itemBusy: Boolean,
    onCheckout: () -> Unit,
    onClear: () -> Unit
) {

    Card(
        modifier =
            Modifier.fillMaxWidth(),
        shape =
            MaterialTheme
                .shapes
                .large,
        colors =
            CardDefaults.cardColors(
                containerColor =
                    VeloraColors.Ink
            )
    ) {

        Column(
            modifier =
                Modifier.padding(
                    22.dp
                )
        ) {

            Text(
                text =
                    "RESUMEN",
                color =
                    VeloraColors.Champagne,
                fontWeight =
                    FontWeight.Bold,
                style =
                    MaterialTheme
                        .typography
                        .labelMedium
            )

            Spacer(
                Modifier.height(6.dp)
            )

            Text(
                text =
                    "Su compra",
                color =
                    VeloraColors.Ivory,
                style =
                    MaterialTheme
                        .typography
                        .headlineMedium
            )

            Spacer(
                Modifier.height(18.dp)
            )

            SummaryLine(
                label =
                    "Piezas",
                value =
                    totalItems
                        .toString()
            )

            Spacer(
                Modifier.height(10.dp)
            )

            SummaryLine(
                label =
                    "Subtotal",
                value =
                    "$currency " +
                        "%.2f".format(
                            subtotal
                        ),
                accent = true
            )

            Spacer(
                Modifier.height(16.dp)
            )

            Surface(
                shape =
                    MaterialTheme
                        .shapes
                        .medium,
                color =
                    VeloraColors.Champagne
                        .copy(
                            alpha = .08f
                        ),
                border =
                    BorderStroke(
                        1.dp,
                        VeloraColors.Champagne
                            .copy(
                                alpha = .24f
                            )
                    )
            ) {

                Text(
                    text =
                        "La bolsa no reserva inventario. La disponibilidad se valida al confirmar el pedido.",
                    modifier =
                        Modifier.padding(
                            12.dp
                        ),
                    color =
                        VeloraColors.Ivory
                            .copy(
                                alpha = .72f
                            ),
                    style =
                        MaterialTheme
                            .typography
                            .bodySmall
                )
            }

            Spacer(
                Modifier.height(16.dp)
            )

            Button(
                modifier =
                    Modifier.fillMaxWidth(),
                enabled =
                    !clearing &&
                        !itemBusy,
                onClick =
                    onCheckout,
                colors =
                    ButtonDefaults
                        .buttonColors(
                            containerColor =
                                VeloraColors.Champagne,
                            contentColor =
                                VeloraColors.Ink
                        )
            ) {
                Text(
                    "CONTINUAR COMPRA"
                )
            }

            Spacer(
                Modifier.height(8.dp)
            )

            OutlinedButton(
                modifier =
                    Modifier.fillMaxWidth(),
                enabled =
                    !clearing &&
                        !itemBusy,
                onClick =
                    onClear,
                border =
                    BorderStroke(
                        1.dp,
                        VeloraColors.Champagne
                            .copy(
                                alpha = .4f
                            )
                    ),
                colors =
                    ButtonDefaults
                        .outlinedButtonColors(
                            contentColor =
                                VeloraColors.Ivory
                        )
            ) {
                Text(
                    if (clearing) {
                        "VACIANDO..."
                    } else {
                        "VACIAR BOLSA"
                    }
                )
            }
        }
    }
}

@Composable
private fun SummaryLine(
    label: String,
    value: String,
    accent: Boolean = false
) {

    Row(
        modifier =
            Modifier.fillMaxWidth(),
        horizontalArrangement =
            Arrangement.SpaceBetween,
        verticalAlignment =
            Alignment.CenterVertically
    ) {

        Text(
            text =
                label,
            color =
                VeloraColors.Ivory
                    .copy(
                        alpha = .7f
                    )
        )

        Text(
            text =
                value,
            color =
                if (accent) {
                    VeloraColors.Champagne
                } else {
                    VeloraColors.Ivory
                },
            fontWeight =
                FontWeight.Bold
        )
    }
}