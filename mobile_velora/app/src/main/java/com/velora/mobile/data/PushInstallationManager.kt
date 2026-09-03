package com.velora.mobile.data

import android.content.Context
import android.os.Build

class PushInstallationManager(
    context: Context
) {

    private val applicationContext =
        context.applicationContext

    private val session =
        SessionStore(
            applicationContext
        )

    private val store =
        PushInstallationStore(
            applicationContext
        )

    fun storeInstallation(
        installationId: String
    ) {
        store.saveInstallationId(
            installationId
        )
    }

    fun syncCurrentInstallation(): Boolean {
        if (
            !session.hasCustomerSession()
        ) {
            return false
        }

        val installationId =
            store.installationId()
                ?: return false

        val api =
            PushInstallationApi(
                ApiClient(
                    tokenProvider = {
                        session.token()
                    }
                )
            )

        api.register(
            installationId =
                installationId,
            deviceLabel =
                deviceLabel()
        )

        return true
    }

    fun revokeCurrentInstallation(): Boolean {
        if (
            !session.hasCustomerSession()
        ) {
            return false
        }

        val installationId =
            store.installationId()
                ?: return false

        val api =
            PushInstallationApi(
                ApiClient(
                    tokenProvider = {
                        session.token()
                    }
                )
            )

        api.revoke(
            installationId
        )

        return true
    }

    private fun deviceLabel(): String {
        val manufacturer =
            Build.MANUFACTURER
                .orEmpty()
                .trim()

        val model =
            Build.MODEL
                .orEmpty()
                .trim()

        return listOf(
            manufacturer,
            model
        )
            .filter {
                it.isNotBlank()
            }
            .joinToString(" ")
            .ifBlank {
                "Android"
            }
            .take(160)
    }
}
