package com.velora.mobile.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.velora.mobile.data.ApiClient
import com.velora.mobile.data.MobileOnlinePaymentIntent
import com.velora.mobile.data.MobilePayment
import com.velora.mobile.data.MobilePaymentMethod
import com.velora.mobile.data.MobilePaymentStatus
import com.velora.mobile.data.PaymentApi
import com.velora.mobile.data.SessionStore
import java.time.Instant
import java.time.YearMonth
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class PaymentUiState(
    val method: MobilePaymentMethod =
        MobilePaymentMethod.CARD,

    val holder: String = "",
    val cardNumber: String = "",
    val expiry: String = "",
    val cvv: String = "",

    val busy: Boolean = false,

    val intent: MobileOnlinePaymentIntent? =
        null,

    val paidPayment: MobilePayment? =
        null,

    val error: String = "",
    val success: String = ""
)

class PaymentViewModel(
    application: Application
) : AndroidViewModel(application) {

    private val session =
        SessionStore(application)

    private val api =
        PaymentApi(
            ApiClient(
                tokenProvider = {
                    session.token()
                }
            )
        )

    private val _state =
        MutableStateFlow(
            PaymentUiState()
        )

    val state:
        StateFlow<PaymentUiState> =
            _state.asStateFlow()

    fun selectMethod(
        method: MobilePaymentMethod
    ) {
        if (
            method != MobilePaymentMethod.CARD &&
            method != MobilePaymentMethod.QR
        ) {
            return
        }

        val current = _state.value

        if (
            current.busy ||
            hasPendingIntent(current)
        ) {
            _state.value =
                current.copy(
                    error =
                        "Cancele o complete el intento de pago actual antes de cambiar de método."
                )

            return
        }

        _state.value =
            current.copy(
                method = method,
                error = "",
                success = ""
            )
    }

    fun updateHolder(
        value: String
    ) {
        if (value.length > 100) {
            return
        }

        _state.value =
            _state.value.copy(
                holder = value,
                error = "",
                success = ""
            )
    }

    fun updateCardNumber(
        value: String
    ) {
        if (value.length > 25) {
            return
        }

        _state.value =
            _state.value.copy(
                cardNumber = value,
                error = "",
                success = ""
            )
    }

    fun updateExpiry(
        value: String
    ) {
        if (value.length > 5) {
            return
        }

        _state.value =
            _state.value.copy(
                expiry = value,
                error = "",
                success = ""
            )
    }

    fun updateCvv(
        value: String
    ) {
        if (
            value.length > 4 ||
            value.any { !it.isDigit() }
        ) {
            return
        }

        _state.value =
            _state.value.copy(
                cvv = value,
                error = "",
                success = ""
            )
    }

    fun payCard(
        orderId: String
    ) {
        val current = _state.value

        if (
            current.busy ||
            hasPendingIntent(current)
        ) {
            return
        }

        val holder =
            current.holder.trim()

        if (
            holder.length < 3 ||
            holder.length > 100
        ) {
            fail(
                "Ingrese correctamente el nombre del titular."
            )

            return
        }

        val cardNumber =
            normalizeCardNumber(
                current.cardNumber
            )

        if (
            cardNumber.length !in 13..19 ||
            !luhnValid(cardNumber)
        ) {
            fail(
                "El número de tarjeta no es válido."
            )

            return
        }

        if (
            !expiryValid(
                current.expiry
            )
        ) {
            fail(
                "La fecha de vencimiento no es válida o ya expiró."
            )

            return
        }

        if (
            current.cvv.length !in 3..4 ||
            current.cvv.any {
                !it.isDigit()
            }
        ) {
            fail(
                "El CVV debe contener 3 o 4 dígitos."
            )

            return
        }

        val brand =
            detectBrand(
                cardNumber
            )

        val last4 =
            cardNumber.takeLast(4)

        /*
         * Token efímero sandbox.
         *
         * PAN y CVV nunca se envían al backend.
         */
        val token =
            "vlr_sbx_" +
                UUID.randomUUID()
                    .toString()
                    .replace(
                        "-",
                        ""
                    )

        _state.value =
            current.copy(
                busy = true,
                error = "",
                success = ""
            )

        viewModelScope.launch {

            var createdIntent:
                MobileOnlinePaymentIntent? =
                    null

            try {

                val created =
                    withContext(
                        Dispatchers.IO
                    ) {
                        api.createOnlineIntent(
                            orderId = orderId,
                            method =
                                MobilePaymentMethod.CARD,
                            cardToken = token,
                            cardBrand = brand,
                            cardLast4 = last4,
                            notes =
                                "Tarjeta $brand terminada en $last4."
                        )
                    }

                createdIntent = created

                /*
                 * Eliminamos inmediatamente
                 * los datos completos de tarjeta
                 * del estado de pantalla.
                 */
                _state.value =
                    _state.value.copy(
                        holder = "",
                        cardNumber = "",
                        expiry = "",
                        cvv = "",
                        intent = created,
                        busy = true,
                        error = "",
                        success = ""
                    )

                val payment =
                    withContext(
                        Dispatchers.IO
                    ) {
                        api.confirmOnlineSandbox(
                            created.payment.id
                        )
                    }

                _state.value =
                    _state.value.copy(
                        busy = false,
                        intent =
                            created.copy(
                                payment =
                                    payment
                            ),
                        paidPayment =
                            payment,
                        error = "",
                        success =
                            "Pago CARD confirmado por ${payment.currency} %.2f.".format(
                                payment.amount
                            )
                    )

            } catch (
                exception: Exception
            ) {

                val created =
                    createdIntent

                if (created != null) {

                    _state.value =
                        _state.value.copy(
                            busy = false,
                            holder = "",
                            cardNumber = "",
                            expiry = "",
                            cvv = "",
                            intent = created,
                            error =
                                exception.message
                                    ?: "El pago fue iniciado, pero todavía no pudo confirmarse.",
                            success = ""
                        )

                } else {

                    _state.value =
                        _state.value.copy(
                            busy = false,
                            error =
                                exception.message
                                    ?: "No fue posible iniciar el pago con tarjeta.",
                            success = ""
                        )
                }
            }
        }
    }

    fun generateQr(
        orderId: String
    ) {
        val current =
            _state.value

        if (
            current.busy ||
            hasPendingIntent(current)
        ) {
            return
        }

        _state.value =
            current.copy(
                busy = true,
                error = "",
                success = ""
            )

        viewModelScope.launch {

            try {

                val intent =
                    withContext(
                        Dispatchers.IO
                    ) {
                        api.createOnlineIntent(
                            orderId = orderId,
                            method =
                                MobilePaymentMethod.QR,
                            cardToken = null,
                            cardBrand = null,
                            cardLast4 = null,
                            notes =
                                "Pago QR online."
                        )
                    }

                if (
                    intent.qrPayload
                        .isNullOrBlank()
                ) {
                    _state.value =
                        _state.value.copy(
                            busy = false,
                            intent = intent,
                            error =
                                "El gateway no devolvió información para generar el QR.",
                            success = ""
                        )

                    return@launch
                }

                _state.value =
                    _state.value.copy(
                        busy = false,
                        intent = intent,
                        error = "",
                        success =
                            "QR generado por el importe exacto del pedido."
                    )

            } catch (
                exception: Exception
            ) {

                _state.value =
                    _state.value.copy(
                        busy = false,
                        error =
                            exception.message
                                ?: "No fue posible generar el pago QR.",
                        success = ""
                    )
            }
        }
    }

    fun confirmCurrentIntent() {
        val current =
            _state.value

        val intent =
            current.intent
                ?: return

        if (
            current.busy ||
            intent.payment.status !=
                MobilePaymentStatus.PENDING
        ) {
            return
        }

        if (
            intent.payment.method ==
                MobilePaymentMethod.QR &&
            qrExpired(intent)
        ) {
            fail(
                "El código QR expiró. Cancele este intento y genere uno nuevo."
            )

            return
        }

        _state.value =
            current.copy(
                busy = true,
                error = "",
                success = ""
            )

        viewModelScope.launch {

            try {

                val payment =
                    withContext(
                        Dispatchers.IO
                    ) {
                        api.confirmOnlineSandbox(
                            intent.payment.id
                        )
                    }

                _state.value =
                    _state.value.copy(
                        busy = false,
                        intent =
                            intent.copy(
                                payment =
                                    payment
                            ),
                        paidPayment =
                            payment,
                        error = "",
                        success =
                            "Pago ${payment.method.name} confirmado por ${payment.currency} %.2f.".format(
                                payment.amount
                            )
                    )

            } catch (
                exception: Exception
            ) {

                _state.value =
                    _state.value.copy(
                        busy = false,
                        error =
                            exception.message
                                ?: "El pago aún no pudo confirmarse.",
                        success = ""
                    )
            }
        }
    }

    fun cancelCurrentIntent() {
        val current =
            _state.value

        val intent =
            current.intent
                ?: return

        if (
            current.busy ||
            intent.payment.status !=
                MobilePaymentStatus.PENDING
        ) {
            return
        }

        _state.value =
            current.copy(
                busy = true,
                error = "",
                success = ""
            )

        viewModelScope.launch {

            try {

                withContext(
                    Dispatchers.IO
                ) {
                    api.cancel(
                        paymentId =
                            intent.payment.id,
                        reason =
                            "Intento de pago cancelado por el cliente."
                    )
                }

                _state.value =
                    PaymentUiState(
                        method =
                            current.method,
                        success =
                            "El intento de pago fue cancelado. Puede seleccionar otro método."
                    )

            } catch (
                exception: Exception
            ) {

                _state.value =
                    _state.value.copy(
                        busy = false,
                        error =
                            exception.message
                                ?: "No fue posible cancelar el intento de pago.",
                        success = ""
                    )
            }
        }
    }

    fun qrExpired(): Boolean {
        val intent =
            _state.value.intent
                ?: return false

        return qrExpired(
            intent
        )
    }

    private fun hasPendingIntent(
        state: PaymentUiState
    ): Boolean {
        return (
            state.intent
                ?.payment
                ?.status ==
                MobilePaymentStatus.PENDING
        )
    }

    private fun qrExpired(
        intent:
            MobileOnlinePaymentIntent
    ): Boolean {
        val expiresAt =
            intent.expiresAt
                ?: return false

        val expiry =
            runCatching {
                Instant.parse(
                    expiresAt
                )
            }.getOrNull()
                ?: return false

        return !expiry.isAfter(
            Instant.now()
        )
    }

    private fun normalizeCardNumber(
        value: String
    ): String {
        return value.filter {
            it.isDigit()
        }
    }

    private fun detectBrand(
        cardNumber: String
    ): String {
        if (
            cardNumber.startsWith("4")
        ) {
            return "VISA"
        }

        val prefix =
            cardNumber
                .take(2)
                .toIntOrNull()

        if (
            prefix != null &&
            prefix in 51..55
        ) {
            return "MASTERCARD"
        }

        return "CARD"
    }

    private fun luhnValid(
        value: String
    ): Boolean {
        var sum = 0
        var doubleDigit =
            false

        for (
            index in
            value.length - 1 downTo 0
        ) {
            var digit =
                value[index]
                    .digitToIntOrNull()
                    ?: return false

            if (doubleDigit) {
                digit *= 2

                if (digit > 9) {
                    digit -= 9
                }
            }

            sum += digit
            doubleDigit =
                !doubleDigit
        }

        return sum % 10 == 0
    }

    private fun expiryValid(
        value: String
    ): Boolean {
        if (
            value.length != 5 ||
            value[2] != '/'
        ) {
            return false
        }

        val month =
            value.substring(
                0,
                2
            ).toIntOrNull()
                ?: return false

        val shortYear =
            value.substring(
                3,
                5
            ).toIntOrNull()
                ?: return false

        if (
            month !in 1..12
        ) {
            return false
        }

        val expiry =
            YearMonth.of(
                2000 + shortYear,
                month
            )

        return !expiry.isBefore(
            YearMonth.now()
        )
    }

    private fun fail(
        message: String
    ) {
        _state.value =
            _state.value.copy(
                busy = false,
                error = message,
                success = ""
            )
    }
}