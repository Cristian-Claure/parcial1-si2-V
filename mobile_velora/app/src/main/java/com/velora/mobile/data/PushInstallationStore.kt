package com.velora.mobile.data

import android.content.Context

class PushInstallationStore(
    context: Context
) {

    private val preferences =
        context.getSharedPreferences(
            PREFERENCES_NAME,
            Context.MODE_PRIVATE
        )

    fun saveInstallationId(
        installationId: String
    ) {
        val normalized =
            installationId.trim()

        require(
            normalized.isNotBlank()
        ) {
            "El Firebase Installation ID no puede estar vacío."
        }

        preferences.edit()
            .putString(
                KEY_INSTALLATION_ID,
                normalized
            )
            /*
             * Eliminamos el valor legacy almacenado
             * por onNewToken(). El targeting nuevo
             * de VÉLORA usa FID.
             */
            .remove(
                KEY_LEGACY_FCM_TOKEN
            )
            .apply()
    }

    fun installationId(): String? {
        return preferences
            .getString(
                KEY_INSTALLATION_ID,
                null
            )
            ?.trim()
            ?.takeIf {
                it.isNotBlank()
            }
    }

    companion object {
        private const val PREFERENCES_NAME =
            "velora_push"

        private const val KEY_INSTALLATION_ID =
            "firebase_installation_id"

        private const val KEY_LEGACY_FCM_TOKEN =
            "fcm_token"
    }
}
