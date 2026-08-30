package com.velora.mobile.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.velora.mobile.data.CatalogApi
import com.velora.mobile.data.MobileProduct
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class CatalogUiState(
    val loading: Boolean = true,
    val products: List<MobileProduct> = emptyList(),
    val error: String = ""
)

class CatalogViewModel(
    application: Application
) : AndroidViewModel(application) {

    private val api = CatalogApi()

    private val _state =
        MutableStateFlow(CatalogUiState())

    val state: StateFlow<CatalogUiState> =
        _state.asStateFlow()

    init {
        loadProducts()
    }

    fun loadProducts() {
        viewModelScope.launch {
            _state.value = CatalogUiState(
                loading = true
            )

            try {
                val products =
                    withContext(Dispatchers.IO) {
                        api.products()
                    }
                    .filter {
                        it.status == "ACTIVE"
                    }

                _state.value = CatalogUiState(
                    loading = false,
                    products = products
                )
            } catch (exception: Exception) {
                _state.value = CatalogUiState(
                    loading = false,
                    error =
                        exception.message
                            ?: "No se pudo cargar el catálogo."
                )
            }
        }
    }
}