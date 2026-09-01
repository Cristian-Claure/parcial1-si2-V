package com.velora.mobile.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.velora.mobile.data.MobileProduct
import com.velora.mobile.ui.theme.VeloraColors

@Composable
fun CustomerCatalogSection(
    onAddToCart: (String) -> Unit = {},
    addingVariantId: String? = null,
    viewModel: CatalogViewModel = viewModel()
) {
    val state by viewModel.state.collectAsState()

    var catalogSearchTerm by
        rememberSaveable {
            mutableStateOf("")
        }

    var catalogCategory by
        rememberSaveable {
            mutableStateOf("TODAS")
        }

    var catalogSortMode by
        rememberSaveable {
            mutableStateOf("FEATURED")
        }

    val categories =
        state.products
            .map {
                it.categoryName.trim()
            }
            .filter {
                it.isNotBlank()
            }
            .distinct()
            .sorted()

    val normalizedSearch =
        normalizeCatalogText(
            catalogSearchTerm
        )

    val filteredProducts =
        state.products.filter {
            product ->

            val matchesCategory =
                catalogCategory ==
                    "TODAS" ||
                    product.categoryName ==
                    catalogCategory

            if (!matchesCategory) {
                false
            }
            else if (
                normalizedSearch.isBlank()
            ) {
                true
            }
            else {
                val searchable =
                    buildList {
                        add(product.name)
                        add(product.categoryName)

                        product.brand?.let {
                            add(it)
                        }

                        product.description?.let {
                            add(it)
                        }

                        product.variants
                            .filter {
                                it.active
                            }
                            .forEach {
                                variant ->

                                add(variant.color)
                                add(variant.size)
                            }
                    }
                        .joinToString(" ")

                normalizeCatalogText(
                    searchable
                ).contains(
                    normalizedSearch
                )
            }
        }

    val visibleProducts =
        when (catalogSortMode) {
            "PRICE_ASC" ->
                filteredProducts.sortedBy {
                    product ->

                    product.variants
                        .filter {
                            it.active
                        }
                        .minByOrNull {
                            it.price
                        }
                        ?.price
                        ?: Double.MAX_VALUE
                }

            "PRICE_DESC" ->
                filteredProducts.sortedByDescending {
                    product ->

                    product.variants
                        .filter {
                            it.active
                        }
                        .minByOrNull {
                            it.price
                        }
                        ?.price
                        ?: -1.0
                }

            "NAME_ASC" ->
                filteredProducts.sortedBy {
                    it.name.lowercase()
                }

            else ->
                filteredProducts
        }

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

        OutlinedTextField(
            modifier =
                Modifier.fillMaxWidth(),
            value =
                catalogSearchTerm,
            onValueChange = {
                catalogSearchTerm = it
            },
            singleLine = true,
            label = {
                Text("Buscar")
            },
            placeholder = {
                Text(
                    "Vestidos, negro, talla M..."
                )
            }
        )

        Spacer(
            Modifier.height(14.dp)
        )

        Text(
            text =
                "CATEGORÍAS",
            color =
                VeloraColors.Terracotta,
            fontWeight =
                FontWeight.Bold
        )

        Spacer(
            Modifier.height(8.dp)
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

            FilterChip(
                selected =
                    catalogCategory ==
                        "TODAS",
                onClick = {
                    catalogCategory =
                        "TODAS"
                },
                label = {
                    Text("Todas")
                }
            )

            categories.forEach {
                category ->

                FilterChip(
                    selected =
                        catalogCategory ==
                            category,
                    onClick = {
                        catalogCategory =
                            category
                    },
                    label = {
                        Text(category)
                    }
                )
            }
        }

        Spacer(
            Modifier.height(14.dp)
        )

        Text(
            text =
                "ORDENAR",
            color =
                VeloraColors.Terracotta,
            fontWeight =
                FontWeight.Bold
        )

        Spacer(
            Modifier.height(8.dp)
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

            FilterChip(
                selected =
                    catalogSortMode ==
                        "FEATURED",
                onClick = {
                    catalogSortMode =
                        "FEATURED"
                },
                label = {
                    Text("Recomendados")
                }
            )

            FilterChip(
                selected =
                    catalogSortMode ==
                        "PRICE_ASC",
                onClick = {
                    catalogSortMode =
                        "PRICE_ASC"
                },
                label = {
                    Text("Menor precio")
                }
            )

            FilterChip(
                selected =
                    catalogSortMode ==
                        "PRICE_DESC",
                onClick = {
                    catalogSortMode =
                        "PRICE_DESC"
                },
                label = {
                    Text("Mayor precio")
                }
            )

            FilterChip(
                selected =
                    catalogSortMode ==
                        "NAME_ASC",
                onClick = {
                    catalogSortMode =
                        "NAME_ASC"
                },
                label = {
                    Text("A–Z")
                }
            )
        }

        Spacer(
            Modifier.height(12.dp)
        )

        Text(
            text =
                if (
                    visibleProducts.size ==
                        1
                ) {
                    "1 pieza encontrada"
                }
                else {
                    "${visibleProducts.size} piezas encontradas"
                },
            color =
                VeloraColors.Muted
        )

        Spacer(
            Modifier.height(18.dp)
        )

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

            visibleProducts.isEmpty() -> {
                Text(
                    text =
                        "No encontramos piezas que coincidan con su búsqueda.",
                    color =
                        VeloraColors.Muted
                )

                TextButton(
                    onClick = {
                        catalogSearchTerm = ""
                        catalogCategory = "TODAS"
                        catalogSortMode =
                            "FEATURED"
                    }
                ) {
                    Text(
                        "LIMPIAR FILTROS"
                    )
                }
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
                        items = visibleProducts,
                        key = { it.id }
                    ) { product ->
                        ProductCard(
                            product = product,
                            onAddToCart = onAddToCart,
                            addingVariantId = addingVariantId
                        )
                    }
                }
            }
        }
    }
}

private fun normalizeCatalogText(
    value: String
): String =
    java.text.Normalizer
        .normalize(
            value.trim().lowercase(),
            java.text.Normalizer.Form.NFD
        )
        .replace(
            Regex("[\u0300-\u036f]"),
            ""
        )

@Composable
private fun ProductCard(
    product: MobileProduct,
    onAddToCart: (String) -> Unit,
    addingVariantId: String?
) {
    val activeVariants =
        product.variants.filter {
            it.active
        }

    val lowestVariant =
        activeVariants.minByOrNull {
            it.price
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
            .map {
                it.color
            }
            .distinct()

    val sizeOptions =
        activeVariants.filter {
            it.color ==
                selectedColor
        }

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
                    10.dp
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

            product.description
                ?.takeIf {
                    it.isNotBlank()
                }
                ?.let {
                    Spacer(
                        Modifier.height(
                            8.dp
                        )
                    )

                    Text(
                        text = it,
                        color =
                            VeloraColors.Muted,
                        style =
                            MaterialTheme
                                .typography
                                .bodyMedium
                    )
                }

            if (
                lowestVariant != null
            ) {
                Spacer(
                    Modifier.height(
                        16.dp
                    )
                )

                Text(
                    text =
                        "Desde " +
                            lowestVariant.currency +
                            " " +
                            "%.2f".format(
                                lowestVariant.price
                            ),
                    color =
                        VeloraColors.Ink,
                    fontWeight =
                        FontWeight.Bold,
                    style =
                        MaterialTheme
                            .typography
                            .titleMedium
                )
            }

            if (
                activeVariants.isNotEmpty()
            ) {
                Spacer(
                    Modifier.height(
                        20.dp
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
                        color ->

                        FilterChip(
                            selected =
                                selectedColor ==
                                    color,
                            onClick = {
                                val currentSize =
                                    selectedVariant
                                        ?.size

                                val candidates =
                                    activeVariants
                                        .filter {
                                            it.color ==
                                                color
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
                                Text(color)
                            }
                        )
                    }
                }

                Spacer(
                    Modifier.height(
                        16.dp
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
                        variant ->

                        FilterChip(
                            selected =
                                selectedVariant
                                    ?.id ==
                                    variant.id,
                            onClick = {
                                selectedVariantId =
                                    variant.id
                            },
                            label = {
                                Text(
                                    variant.size
                                )
                            }
                        )
                    }
                }

                selectedVariant?.let {
                    variant ->

                    Spacer(
                        Modifier.height(
                            18.dp
                        )
                    )

                    Card(
                        modifier =
                            Modifier
                                .fillMaxWidth(),
                        colors =
                            CardDefaults
                                .cardColors(
                                    containerColor =
                                        VeloraColors
                                            .SurfaceSoft
                                )
                    ) {
                        Column(
                            modifier =
                                Modifier.padding(
                                    14.dp
                                )
                        ) {
                            Text(
                                text =
                                    "${variant.color} · Talla ${variant.size}",
                                color =
                                    VeloraColors.Ink,
                                fontWeight =
                                    FontWeight.Bold
                            )

                            Spacer(
                                Modifier.height(
                                    4.dp
                                )
                            )

                            Text(
                                text =
                                    "${variant.currency} " +
                                        "%.2f".format(
                                            variant.price
                                        ),
                                color =
                                    VeloraColors.Muted
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
                            Modifier
                                .fillMaxWidth(),
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
                }
            }
            else {
                Spacer(
                    Modifier.height(
                        14.dp
                    )
                )

                Text(
                    text =
                        "Sin variantes disponibles.",
                    color =
                        VeloraColors.Error
                )
            }
        }
    }
}