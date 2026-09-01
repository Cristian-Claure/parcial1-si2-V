package com.velora.mobile.data

import android.content.Context

enum class CustomerOfflineScope(
    val storageKey: String
) {
    CATALOG("catalog"),
    CART("cart"),
    CHECKOUT("checkout"),
    ORDER_QUEUE("order_queue")
}

class CustomerOfflineStore(
    context: Context
) {
    private val preferences =
        context.getSharedPreferences(
            PREFERENCES_NAME,
            Context.MODE_PRIVATE
        )

    private val session =
        SessionStore(context)

    fun save(
        scope: CustomerOfflineScope,
        value: String
    ) {
        require(value.isNotBlank()) {
            "No se puede guardar contenido offline vacío."
        }

        preferences
            .edit()
            .putString(
                storageKey(scope),
                value
            )
            .apply()
    }

    fun load(
        scope: CustomerOfflineScope
    ): String? {
        return preferences.getString(
            storageKey(scope),
            null
        )
    }

    fun contains(
        scope: CustomerOfflineScope
    ): Boolean {
        return preferences.contains(
            storageKey(scope)
        )
    }

    fun remove(
        scope: CustomerOfflineScope
    ) {
        preferences
            .edit()
            .remove(
                storageKey(scope)
            )
            .apply()
    }

    fun clearCurrentCustomer() {
        val customerId =
            currentCustomerId()

        val editor =
            preferences.edit()

        CustomerOfflineScope
            .values()
            .forEach { scope ->
                editor.remove(
                    "$customerId:${scope.storageKey}"
                )
            }

        editor.apply()
    }

    private fun storageKey(
        scope: CustomerOfflineScope
    ): String {
        return "${currentCustomerId()}:${scope.storageKey}"
    }

    private fun currentCustomerId(): String {
        require(
            session.role() == "CUSTOMER"
        ) {
            "El almacenamiento offline solo está disponible para CUSTOMER."
        }

        val customerId =
            session.userId()
                .trim()

        require(
            customerId.isNotBlank()
        ) {
            "No existe un CUSTOMER autenticado para acceder a datos offline."
        }

        return customerId
    }

    private companion object {
        const val PREFERENCES_NAME =
            "velora_customer_offline"
    }
}