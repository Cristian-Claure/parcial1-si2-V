package com.velora.mobile.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.velora.mobile.data.MobileProduct
import com.velora.mobile.ui.theme.VeloraColors

@Composable
fun CustomerFavoritesSection(
    state: FavoritesUiState,
    onRetry: () -> Unit,
    onExplore: () -> Unit,
    onOpenProduct: (MobileProduct) -> Unit,
    onRemove: (MobileProduct) -> Unit
) {
    Column(
        modifier =
            Modifier.fillMaxWidth()
    ) {
        Text(
            text = "FAVORITOS",
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
                "Las piezas que inspiran su estilo.",
            color =
                VeloraColors.Ink,
            style =
                MaterialTheme
                    .typography
                    .headlineMedium
        )

        Spacer(
            Modifier.height(
                8.dp
            )
        )

        Text(
            text =
                "Guarde productos y vuelva a ellos para elegir color y talla cuando esté lista.",
            color =
                VeloraColors.Muted
        )

        if (
            state.message
                .isNotBlank()
        ) {
            Spacer(
                Modifier.height(
                    14.dp
                )
            )

            Text(
                text =
                    state.message,
                color =
                    VeloraColors.Success
            )
        }

        if (
            state.error
                .isNotBlank()
        ) {
            Spacer(
                Modifier.height(
                    14.dp
                )
            )

            Text(
                text =
                    state.error,
                color =
                    VeloraColors.Error
            )

            TextButton(
                onClick =
                    onRetry
            ) {
                Text(
                    "REINTENTAR"
                )
            }
        }

        Spacer(
            Modifier.height(
                20.dp
            )
        )

        when {
            state.loading -> {
                Text(
                    text =
                        "Cargando sus favoritos...",
                    color =
                        VeloraColors.Muted
                )
            }

            state.products.isEmpty() -> {
                Card(
                    modifier =
                        Modifier.fillMaxWidth(),
                    colors =
                        CardDefaults.cardColors(
                            containerColor =
                                VeloraColors.Card
                        ),
                    border =
                        CardDefaults
                            .outlinedCardBorder()
                ) {
                    Column(
                        modifier =
                            Modifier.padding(
                                20.dp
                            )
                    ) {
                        Text(
                            text =
                                "♡",
                            color =
                                VeloraColors
                                    .Terracotta,
                            style =
                                MaterialTheme
                                    .typography
                                    .displayLarge
                        )

                        Spacer(
                            Modifier.height(
                                8.dp
                            )
                        )

                        Text(
                            text =
                                "Todavía no guardó ninguna pieza.",
                            color =
                                VeloraColors.Ink,
                            style =
                                MaterialTheme
                                    .typography
                                    .titleLarge
                        )

                        Spacer(
                            Modifier.height(
                                8.dp
                            )
                        )

                        Text(
                            text =
                                "Abra el detalle de cualquier producto y utilice Guardar en favoritos.",
                            color =
                                VeloraColors.Muted
                        )

                        Spacer(
                            Modifier.height(
                                16.dp
                            )
                        )

                        OutlinedButton(
                            modifier =
                                Modifier
                                    .fillMaxWidth(),
                            onClick =
                                onExplore
                        ) {
                            Text(
                                "EXPLORAR COLECCIÓN"
                            )
                        }
                    }
                }
            }

            else -> {
                state.products.forEach {
                    product ->

                    FavoriteProductCard(
                        product =
                            product,
                        busy =
                            state.busyProductId ==
                                product.id,
                        onOpenProduct =
                            onOpenProduct,
                        onRemove =
                            onRemove
                    )

                    Spacer(
                        Modifier.height(
                            14.dp
                        )
                    )
                }
            }
        }
    }
}

@Composable
private fun FavoriteProductCard(
    product: MobileProduct,
    busy: Boolean,
    onOpenProduct: (MobileProduct) -> Unit,
    onRemove: (MobileProduct) -> Unit
) {
    val image =
        product.images
            .sortedWith(
                compareByDescending<com.velora.mobile.data.MobileImage> {
                    it.primary
                }
                    .thenBy {
                        it.sortOrder
                    }
            )
            .firstOrNull()

    val lowestPrice =
        product.variants
            .filter {
                it.active
            }
            .minByOrNull {
                it.price
            }

    Card(
        modifier =
            Modifier.fillMaxWidth(),
        colors =
            CardDefaults.cardColors(
                containerColor =
                    VeloraColors.Card
            ),
        border =
            CardDefaults
                .outlinedCardBorder()
    ) {
        Column(
            modifier =
                Modifier.padding(
                    16.dp
                )
        ) {
            if (
                image != null
            ) {
                AsyncImage(
                    model =
                        image.imageUrl,
                    contentDescription =
                        image.altText
                            ?: product.name,
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .height(
                                260.dp
                            ),
                    contentScale =
                        ContentScale.Crop
                )

                Spacer(
                    Modifier.height(
                        14.dp
                    )
                )
            }

            Text(
                text =
                    product.categoryName
                        .uppercase(),
                color =
                    VeloraColors
                        .Terracotta,
                fontWeight =
                    FontWeight.Bold,
                style =
                    MaterialTheme
                        .typography
                        .labelSmall
            )

            Spacer(
                Modifier.height(
                    5.dp
                )
            )

            Text(
                text =
                    product.name,
                color =
                    VeloraColors.Ink,
                style =
                    MaterialTheme
                        .typography
                        .titleLarge
            )

            lowestPrice?.let {
                variant ->

                Spacer(
                    Modifier.height(
                        8.dp
                    )
                )

                Text(
                    text =
                        "Desde ${variant.currency} " +
                            "%.2f".format(
                                variant.price
                            ),
                    color =
                        VeloraColors.Muted
                )
            }

            Spacer(
                Modifier.height(
                    16.dp
                )
            )

            OutlinedButton(
                modifier =
                    Modifier.fillMaxWidth(),
                onClick = {
                    onOpenProduct(
                        product
                    )
                }
            ) {
                Text(
                    "VER PRODUCTO"
                )
            }

            Spacer(
                Modifier.height(
                    8.dp
                )
            )

            TextButton(
                modifier =
                    Modifier.fillMaxWidth(),
                enabled =
                    !busy,
                onClick = {
                    onRemove(
                        product
                    )
                }
            ) {
                Text(
                    if (busy) {
                        "RETIRANDO..."
                    }
                    else {
                        "RETIRAR DE FAVORITOS"
                    }
                )
            }
        }
    }
}