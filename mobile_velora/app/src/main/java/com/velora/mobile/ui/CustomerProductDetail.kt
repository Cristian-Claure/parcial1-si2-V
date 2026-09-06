package com.velora.mobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.velora.mobile.data.MobileProduct
import com.velora.mobile.data.MobileVariant
import com.velora.mobile.ui.theme.VeloraColors

@Composable
fun CustomerProductDetail(
    product: MobileProduct,
    addingVariantId: String?,
    isFavorite: Boolean,
    favoriteBusy: Boolean,
    onAddToCart: (String) -> Unit,
    onToggleFavorite: () -> Unit,
    onBackToCatalog: () -> Unit,
    onOpenCart: () -> Unit,
    onOpenTryOn: (String) -> Unit
) {
    val activeVariants =
        product.variants.filter {
            it.active
        }

    var selectedVariantId by
        rememberSaveable(
            product.id
        ) {
            mutableStateOf(
                activeVariants
                    .firstOrNull()
                    ?.id
                    .orEmpty()
            )
        }

    val selectedVariant =
        activeVariants.firstOrNull {
            it.id ==
                selectedVariantId
        } ?: activeVariants.firstOrNull()

    val selectedColor =
        selectedVariant
            ?.color
            .orEmpty()

    val colorOptions =
        activeVariants
            .distinctBy {
                it.color
            }

    val sizeOptions =
        activeVariants.filter {
            it.color ==
                selectedColor
        }

    val images =
        product.images.sortedWith(
            compareByDescending<com.velora.mobile.data.MobileImage> {
                it.primary
            }
                .thenBy {
                    it.sortOrder
                }
        )

    var selectedImageId by
        rememberSaveable(
            product.id
        ) {
            mutableStateOf(
                images
                    .firstOrNull()
                    ?.id
                    .orEmpty()
            )
        }

    val selectedImage =
        images.firstOrNull {
            it.id ==
                selectedImageId
        } ?: images.firstOrNull()

    Column(
        modifier =
            Modifier.fillMaxWidth()
    ) {
        OutlinedButton(
            onClick =
                onBackToCatalog
        ) {
            Text(
                "← VOLVER A LA COLECCIÓN"
            )
        }

        Spacer(
            Modifier.height(
                18.dp
            )
        )

        ProductImageGallery(
            product = product,
            selectedImageId =
                selectedImage?.id,
            selectedImageUrl =
                selectedImage?.imageUrl,
            selectedImageAlt =
                selectedImage
                    ?.altText
                    ?: product.name,
            onSelectImage = {
                selectedImageId = it
            }
        )

        Spacer(
            Modifier.height(
                24.dp
            )
        )

        Text(
            text =
                product.categoryName
                    .uppercase(),
            color =
                VeloraColors.Terracotta,
            fontWeight =
                FontWeight.Bold,
            style =
                MaterialTheme
                    .typography
                    .labelMedium
        )

        product.brand
            ?.takeIf {
                it.isNotBlank()
            }
            ?.let {
                Spacer(
                    Modifier.height(
                        5.dp
                    )
                )

                Text(
                    text = it,
                    color =
                        VeloraColors.Muted,
                    style =
                        MaterialTheme
                            .typography
                            .labelMedium
                )
            }

        Spacer(
            Modifier.height(
                8.dp
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
                    .headlineLarge
        )

        product.description
            ?.takeIf {
                it.isNotBlank()
            }
            ?.let {
                Spacer(
                    Modifier.height(
                        12.dp
                    )
                )

                Text(
                    text = it,
                    color =
                        VeloraColors.Muted,
                    style =
                        MaterialTheme
                            .typography
                            .bodyLarge
                )
            }

        selectedVariant?.let {
            variant ->

            Spacer(
                Modifier.height(
                    24.dp
                )
            )

            ProductPrice(
                variant =
                    variant
            )

            Spacer(
                Modifier.height(
                    24.dp
                )
            )

            Text(
                text = "COLOR",
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
                Modifier.height(
                    8.dp
                )
            )

            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .horizontalScroll(
                            rememberScrollState()
                        ),
                horizontalArrangement =
                    Arrangement.spacedBy(
                        8.dp
                    )
            ) {
                colorOptions.forEach {
                    option ->

                    FilterChip(
                        selected =
                            selectedColor ==
                                option.color,
                        onClick = {
                            val currentSize =
                                selectedVariant
                                    .size

                            val candidates =
                                activeVariants
                                    .filter {
                                        it.color ==
                                            option.color
                                    }

                            val next =
                                candidates
                                    .firstOrNull {
                                        it.size ==
                                            currentSize
                                    }
                                    ?: candidates
                                        .firstOrNull()

                            if (next != null) {
                                selectedVariantId =
                                    next.id
                            }
                        },
                        label = {
                            Row(
                                verticalAlignment =
                                    Alignment.CenterVertically,
                                horizontalArrangement =
                                    Arrangement.spacedBy(
                                        7.dp
                                    )
                            ) {
                                productColor(
                                    option.colorHex
                                )?.let {
                                    color ->

                                    Box(
                                        modifier =
                                            Modifier
                                                .size(
                                                    12.dp
                                                )
                                                .background(
                                                    color,
                                                    shape =
                                                        MaterialTheme
                                                            .shapes
                                                            .small
                                                )
                                    )
                                }

                                Text(
                                    option.color
                                )
                            }
                        }
                    )
                }
            }

            Spacer(
                Modifier.height(
                    18.dp
                )
            )

            Text(
                text = "TALLA",
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
                Modifier.height(
                    8.dp
                )
            )

            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .horizontalScroll(
                            rememberScrollState()
                        ),
                horizontalArrangement =
                    Arrangement.spacedBy(
                        8.dp
                    )
            ) {
                sizeOptions.forEach {
                    sizeVariant ->

                    FilterChip(
                        selected =
                            selectedVariantId ==
                                sizeVariant.id,
                        onClick = {
                            selectedVariantId =
                                sizeVariant.id
                        },
                        label = {
                            Text(
                                sizeVariant.size
                            )
                        }
                    )
                }
            }

            Spacer(
                Modifier.height(
                    20.dp
                )
            )

            Card(
                modifier =
                    Modifier.fillMaxWidth(),
                colors =
                    CardDefaults.cardColors(
                        containerColor =
                            VeloraColors
                                .SurfaceSoft
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
                            "SU SELECCIÓN",
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
                            "${variant.color} · Talla ${variant.size}",
                        color =
                            VeloraColors.Ink,
                        fontWeight =
                            FontWeight.Bold
                    )
                }
            }

            Spacer(
                Modifier.height(
                    14.dp
                )
            )

            Button(
                modifier =
                    Modifier.fillMaxWidth(),
                enabled =
                    addingVariantId ==
                        null,
                onClick = {
                    onAddToCart(
                        variant.id
                    )
                }
            ) {
                Text(
                    if (
                        addingVariantId ==
                            variant.id
                    ) {
                        "AÑADIENDO..."
                    }
                    else {
                        "AGREGAR A MI BOLSA"
                    }
                )
            }

            Spacer(
                Modifier.height(
                    10.dp
                )
            )

            OutlinedButton(
                modifier =
                    Modifier.fillMaxWidth(),
                onClick =
                    onOpenCart
            ) {
                Text(
                    "VER MI BOLSA"
                )
            }
        }

        if (
            activeVariants.isEmpty()
        ) {
            Spacer(
                Modifier.height(
                    18.dp
                )
            )

            Text(
                text =
                    "Esta pieza no tiene variantes disponibles en este momento.",
                color =
                    VeloraColors.Error
            )
        }

        OutlinedButton(
            modifier =
                Modifier.fillMaxWidth(),
            enabled =
                !favoriteBusy,
            onClick =
                onToggleFavorite
        ) {
            Text(
                if (favoriteBusy) {
                    "ACTUALIZANDO..."
                }
                else if (isFavorite) {
                    "♥ GUARDADO EN FAVORITOS"
                }
                else {
                    "♡ GUARDAR EN FAVORITOS"
                }
            )
        }

        Spacer(
            Modifier.height(
                10.dp
            )
        )

        ProductInformation(
            title =
                "COMPOSICIÓN",
            value =
                product.composition
        )

        ProductInformation(
            title =
                "CALCE",
            value =
                product.fitNotes
        )

        ProductInformation(
            title =
                "CUIDADOS",
            value =
                product.careInstructions
        )

        Spacer(
            Modifier.height(
                24.dp
            )
        )

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
                        18.dp
                    )
            ) {
                Text(
                    text =
                        "EXPERIENCIA VÉLORA",
                    color =
                        VeloraColors
                            .Terracotta,
                    fontWeight =
                        FontWeight.Bold,
                    style =
                        MaterialTheme
                            .typography
                            .labelMedium
                )

                Spacer(
                    Modifier.height(
                        7.dp
                    )
                )

                Text(
                    text =
                        "Probador virtual",
                    color =
                        VeloraColors.Ink,
                    style =
                        MaterialTheme
                            .typography
                            .titleLarge
                )

                Spacer(
                    Modifier.height(
                        6.dp
                    )
                )

                if (
                    product.tryOnEnabled &&
                    product.tryOnReady &&
                    selectedVariant != null
                ) {
                    Text(
                        text =
                            "Esta pieza está preparada para una prueba virtual. La categoría se obtiene automáticamente del catálogo.",
                        color =
                            VeloraColors.Muted
                    )

                    Spacer(
                        Modifier.height(
                            12.dp
                        )
                    )

                    Button(
                        modifier =
                            Modifier.fillMaxWidth(),
                        onClick = {
                            onOpenTryOn(
                                selectedVariant.id
                            )
                        }
                    ) {
                        Text(
                            "PROBAR ESTA PRENDA"
                        )
                    }
                }
                else {
                    Text(
                        text =
                            "Esta pieza todavía no tiene una imagen Try-On preparada.",
                        color =
                            VeloraColors.Muted
                    )
                }
            }
        }

        Spacer(
            Modifier.height(
                28.dp
            )
        )
    }
}

@Composable
private fun ProductImageGallery(
    product: MobileProduct,
    selectedImageId: String?,
    selectedImageUrl: String?,
    selectedImageAlt: String,
    onSelectImage: (String) -> Unit
) {
    val images =
        product.images.sortedWith(
            compareByDescending<com.velora.mobile.data.MobileImage> {
                it.primary
            }
                .thenBy {
                    it.sortOrder
                }
        )

    Card(
        modifier =
            Modifier
                .fillMaxWidth()
                .height(
                    420.dp
                ),
        colors =
            CardDefaults.cardColors(
                containerColor =
                    VeloraColors.Ink
            )
    ) {
        Box(
            modifier =
                Modifier.fillMaxSize(),
            contentAlignment =
                Alignment.Center
        ) {
            if (
                selectedImageUrl
                    .isNullOrBlank()
            ) {
                ProductImagePlaceholder()
            }
            else {
                AsyncImage(
                    model =
                        selectedImageUrl,
                    contentDescription =
                        selectedImageAlt,
                    modifier =
                        Modifier.fillMaxSize(),
                    contentScale =
                        ContentScale.Crop
                )
            }
        }
    }

    if (
        images.size > 1
    ) {
        Spacer(
            Modifier.height(
                10.dp
            )
        )

        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .horizontalScroll(
                        rememberScrollState()
                    ),
            horizontalArrangement =
                Arrangement.spacedBy(
                    8.dp
                )
        ) {
            images.forEach {
                image ->

                OutlinedButton(
                    modifier =
                        Modifier.size(
                            width =
                                78.dp,
                            height =
                                92.dp
                        ),
                    onClick = {
                        onSelectImage(
                            image.id
                        )
                    }
                ) {
                    if (
                        selectedImageId ==
                            image.id
                    ) {
                        Box(
                            modifier =
                                Modifier
                                    .fillMaxSize()
                                    .background(
                                        VeloraColors
                                            .SurfaceSoft
                                    ),
                            contentAlignment =
                                Alignment.Center
                        ) {
                            AsyncImage(
                                model =
                                    image.imageUrl,
                                contentDescription =
                                    image.altText
                                        ?: product.name,
                                modifier =
                                    Modifier
                                        .fillMaxSize(),
                                contentScale =
                                    ContentScale.Crop
                            )
                        }
                    }
                    else {
                        AsyncImage(
                            model =
                                image.imageUrl,
                            contentDescription =
                                image.altText
                                    ?: product.name,
                            modifier =
                                Modifier
                                    .fillMaxSize(),
                            contentScale =
                                ContentScale.Crop
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ProductImagePlaceholder() {
    Column(
        horizontalAlignment =
            Alignment.CenterHorizontally
    ) {
        Text(
            text = "V",
            color =
                VeloraColors.Champagne,
            style =
                MaterialTheme
                    .typography
                    .displayLarge
        )

        Text(
            text = "VÉLORA",
            color =
                VeloraColors.Champagne,
            fontWeight =
                FontWeight.Bold,
            style =
                MaterialTheme
                    .typography
                    .labelMedium
        )
    }
}

@Composable
private fun ProductPrice(
    variant: MobileVariant
) {
    Row(
        verticalAlignment =
            Alignment.Bottom,
        horizontalArrangement =
            Arrangement.spacedBy(
                12.dp
            )
    ) {
        Text(
            text =
                "${variant.currency} " +
                    "%.2f".format(
                        variant.price
                    ),
            color =
                VeloraColors.Ink,
            style =
                MaterialTheme
                    .typography
                    .headlineSmall
        )

        variant.compareAtPrice
            ?.takeIf {
                it >
                    variant.price
            }
            ?.let {
                previousPrice ->

                Text(
                    text =
                        "${variant.currency} " +
                            "%.2f".format(
                                previousPrice
                            ),
                    color =
                        VeloraColors
                            .MutedLight,
                    textDecoration =
                        TextDecoration
                            .LineThrough
                )
            }
    }
}

@Composable
private fun ProductInformation(
    title: String,
    value: String?
) {
    value
        ?.takeIf {
            it.isNotBlank()
        }
        ?.let {
            text ->

            Spacer(
                Modifier.height(
                    22.dp
                )
            )

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
                        text = title,
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
                            6.dp
                        )
                    )

                    Text(
                        text = text,
                        color =
                            VeloraColors.Muted
                    )
                }
            }
        }
}

private fun productColor(
    value: String?
): Color? =
    value
        ?.takeIf {
            it.isNotBlank()
        }
        ?.let {
            raw ->

            runCatching {
                Color(
                    android.graphics.Color
                        .parseColor(
                            raw
                        )
                )
            }
                .getOrNull()
        }
