package com.velora.mobile.data

import android.content.Context

class SessionStore(context: Context) {
    private val preferences =
        context.getSharedPreferences("velora_session", Context.MODE_PRIVATE)

    fun save(response: MobileAuthResponse) {
        preferences.edit()
            .putString("access_token", response.accessToken)
            .putString("user_id", response.user.id)
            .putString("first_name", response.user.firstName)
            .putString("email", response.user.email)
            .putString("role", response.user.role)
            .apply()
    }

    fun clear() = preferences.edit().clear().apply()

    fun token(): String? = preferences.getString("access_token", null)
    fun userId(): String = preferences.getString("user_id", "") ?: ""
    fun firstName(): String = preferences.getString("first_name", "") ?: ""
    fun email(): String = preferences.getString("email", "") ?: ""
    fun role(): String = preferences.getString("role", "") ?: ""

    fun hasCustomerSession(): Boolean {
        return !token().isNullOrBlank() &&
            userId().isNotBlank() &&
            role() == "CUSTOMER"
    }
}
