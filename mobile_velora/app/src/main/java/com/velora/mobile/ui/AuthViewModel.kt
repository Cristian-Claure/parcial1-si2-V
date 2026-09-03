package com.velora.mobile.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.velora.mobile.data.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class AuthUiState(
    val loading: Boolean = false,
    val error: String = "",
    val authenticated: Boolean = false,
    val firstName: String = "",
    val email: String = ""
)

class AuthViewModel(application: Application) : AndroidViewModel(application) {
    private val api = AuthApi()
    private val session = SessionStore(application)

    private val pushInstallations =
        PushInstallationManager(
            application
        )

    private val _state = MutableStateFlow(
        AuthUiState(
            authenticated = session.hasCustomerSession(),
            firstName = session.firstName(),
            email = session.email()
        )
    )

    val state: StateFlow<AuthUiState> = _state.asStateFlow()

    init {
        /*
         * Si la aplicación abre con una sesión
         * CUSTOMER persistida y ya conocemos el FID,
         * refrescamos last_seen_at en el backend.
         */
        if (
            session.hasCustomerSession()
        ) {
            syncPushInstallation()
        }
    }

    fun login(email: String, password: String) {
        execute { api.login(email.trim(), password) }
    }

    fun register(firstName: String, lastName: String, email: String, password: String) {
        execute {
            api.register(firstName.trim(), lastName.trim(), email.trim(), password)
        }
    }

    fun logout() {
        viewModelScope.launch {
            /*
             * Revocamos mientras el JWT todavía
             * está disponible. Aunque la red falle,
             * la sesión local siempre se cerrará.
             */
            withContext(
                Dispatchers.IO
            ) {
                runCatching {
                    pushInstallations
                        .revokeCurrentInstallation()
                }
            }

            session.clear()
            _state.value =
                AuthUiState()
        }
    }

    fun clearError() {
        _state.value = _state.value.copy(error = "")
    }

    private fun execute(request: suspend () -> MobileAuthResponse) {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = "")

            try {
                val response = withContext(Dispatchers.IO) { request() }

                if (response.user.role != "CUSTOMER") {
                    throw IllegalStateException(
                        "La aplicación móvil de cliente no admite cuentas administrativas."
                    )
                }

                session.save(response)
                _state.value = AuthUiState(
                    authenticated = true,
                    firstName = response.user.firstName,
                    email = response.user.email
                )

                /*
                 * El login/registro no depende de FCM.
                 * Sincronizamos el FID en segundo plano
                 * y conservamos la sesión aunque el
                 * backend push no esté disponible.
                 */
                syncPushInstallation()

            } catch (exception: Exception) {
                _state.value = _state.value.copy(
                    loading = false,
                    error = exception.message ?: "No se pudo completar la solicitud."
                )
            }
        }
    }

    private fun syncPushInstallation() {
        viewModelScope.launch(
            Dispatchers.IO
        ) {
            runCatching {
                pushInstallations
                    .syncCurrentInstallation()
            }
        }
    }
}
