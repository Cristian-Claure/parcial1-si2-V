package com.velora.mobile.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.velora.mobile.data.MobileProduct
import com.velora.mobile.ui.theme.VeloraColors

@Composable
fun CustomerCatalogSection(
    viewModel: CatalogViewModel = viewModel()
) {
    val state by viewModel.state.collectAsState()

    Column(
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(
            text = "COLECCIÓN VÉLORA",
            color = VeloraColors.Terracotta,
            fontWeight = FontWeight.Bold
        )

        Spacer(Modifier.height(6.dp))

        Text(
            text = "Explore nuestras piezas disponibles.",
            color = VeloraColors.Ink,
            fontStyle = FontStyle.Italic
        )

        Spacer(Modifier.height(18.dp))

        when {
            state.loading -> {
                Text(
                    text = "Cargando colección...",
                    color = VeloraColors.Muted
                )
            }

            state.error.isNotBlank() -> {
                Text(
                    text = state.error,
                    color = VeloraColors.Error
                )

                TextButton(
                    onClick = viewModel::loadProducts
                ) {
                    Text("REINTENTAR")
                }
            }

            state.products.isEmpty() -> {
                Text(
                    text = "La colección aún no tiene productos disponibles.",
                    color = VeloraColors.Muted
                )
            }

            else -> {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 440.dp),
                    verticalArrangement =
                        Arrangement.spacedBy(12.dp)
                ) {
                    items(
                        items = state.products,
                        key = { it.id }
                    ) { product ->
                        ProductCard(product)
                    }
                }
            }
        }
    }
}

@Composable
private fun ProductCard(
    product: MobileProduct
) {
    val activeVariants =
        product.variants.filter {
            it.active
        }

    val lowestVariant =
        activeVariants.minByOrNull {
            it.price
        }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = VeloraColors.Card
        )
    ) {
        Column(
            modifier = Modifier.padding(18.dp)
        ) {
            Text(
                text = product.categoryName.uppercase(),
                color = VeloraColors.Terracotta
            )

            Spacer(Modifier.height(7.dp))

            Text(
                text = product.name,
                color = VeloraColors.Ink,
                fontWeight = FontWeight.Bold
            )

            product.brand?.let {
                Spacer(Modifier.height(4.dp))

                Text(
                    text = it,
                    color = VeloraColors.Muted
                )
            }

            product.description?.let {
                Spacer(Modifier.height(8.dp))

                Text(
                    text = it,
                    color = VeloraColors.Muted
                )
            }

            Spacer(Modifier.height(12.dp))

            if (lowestVariant != null) {
                Text(
                    text =
                        "Desde ${lowestVariant.currency} " +
                            "%.2f".format(lowestVariant.price),
                    color = VeloraColors.Ink,
                    fontWeight = FontWeight.Bold
                )
            }

            Spacer(Modifier.height(8.dp))

            Text(
                text =
                    "${activeVariants.size} variante(s) disponible(s)",
                color = VeloraColors.Muted
            )

            if (activeVariants.isNotEmpty()) {
                Spacer(Modifier.height(5.dp))

                Text(
                    text = activeVariants.joinToString(
                        separator = " · "
                    ) {
                        "${it.color} ${it.size}"
                    },
                    color = VeloraColors.Muted
                )
            }
        }
    }
}