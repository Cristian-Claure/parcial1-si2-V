package com.velora.mobile.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
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
            text = "SU BOLSA",
            color =
                VeloraColors.Terracotta,
            fontWeight =
                FontWeight.Bold
        )

        Spacer(
            Modifier.height(8.dp)
        )

        when {

            state.loading -> {

                Text(
                    "Cargando bolsa...",
                    color =
                        VeloraColors.Muted
                )
            }

            state.error.isNotBlank() -> {

                Text(
                    state.error,
                    color =
                        VeloraColors.Error
                )

                TextButton(
                    onClick =
                        viewModel::load
                ) {
                    Text("REINTENTAR")
                }
            }

            state.cart.items.isEmpty() -> {

                Text(
                    "Su bolsa está vacía.",
                    color =
                        VeloraColors.Muted
                )
            }

            else -> {

                LazyColumn(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .heightIn(
                                max = 420.dp
                            ),
                    verticalArrangement =
                        Arrangement.spacedBy(
                            10.dp
                        )
                ) {

                    items(
                        items =
                            state.cart.items,
                        key = {
                            it.id
                        }
                    ) { item ->

                        CartItemCard(
                            item = item,
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
                    Modifier.height(16.dp)
                )

                Row(
                    modifier =
                        Modifier.fillMaxWidth(),
                    horizontalArrangement =
                        Arrangement.SpaceBetween
                ) {

                    Text(
                        "TOTAL",
                        color =
                            VeloraColors.Muted
                    )

                    Text(
                        "${state.cart.currency} " +
                            "%.2f".format(
                                state.cart.subtotal
                            ),
                        color =
                            VeloraColors.Ink,
                        fontWeight =
                            FontWeight.Bold
                    )
                }

                Spacer(
                    Modifier.height(14.dp)
                )

                Button(
                    modifier =
                        Modifier.fillMaxWidth(),
                    onClick =
                        onCheckout
                ) {
                    Text(
                        "CONTINUAR AL CHECKOUT"
                    )
                }

                Spacer(
                    Modifier.height(8.dp)
                )

                OutlinedButton(
                    modifier =
                        Modifier.fillMaxWidth(),
                    enabled =
                        !state.clearing,
                    onClick =
                        viewModel::clear
                ) {
                    Text(
                        if (
                            state.clearing
                        ) {
                            "VACIANDO..."
                        } else {
                            "VACIAR BOLSA"
                        }
                    )
                }
            }
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
                item.productName,
                color =
                    VeloraColors.Ink,
                fontWeight =
                    FontWeight.Bold
            )

            Spacer(
                Modifier.height(5.dp)
            )

            Text(
                "${item.color} · ${item.size}",
                color =
                    VeloraColors.Muted
            )

            Spacer(
                Modifier.height(5.dp)
            )

            Text(
                "${item.currency} " +
                    "%.2f".format(
                        item.unitPrice
                    ),
                color =
                    VeloraColors.Ink
            )

            Spacer(
                Modifier.height(10.dp)
            )

            Row(
                horizontalArrangement =
                    Arrangement.spacedBy(
                        8.dp
                    )
            ) {

                OutlinedButton(
                    enabled = !busy,
                    onClick =
                        onDecrease
                ) {
                    Text("−")
                }

                Text(
                    text =
                        item.quantity
                            .toString(),
                    modifier =
                        Modifier.padding(
                            12.dp
                        ),
                    color =
                        VeloraColors.Ink
                )

                OutlinedButton(
                    enabled = !busy,
                    onClick =
                        onIncrease
                ) {
                    Text("+")
                }

                TextButton(
                    enabled = !busy,
                    onClick =
                        onRemove
                ) {
                    Text("QUITAR")
                }
            }
        }
    }
}