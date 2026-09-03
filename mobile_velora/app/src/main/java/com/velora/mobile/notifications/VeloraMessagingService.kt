package com.velora.mobile.notifications

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.velora.mobile.MainActivity
import com.velora.mobile.data.PushInstallationManager
import com.velora.mobile.data.SessionStore

class VeloraMessagingService : FirebaseMessagingService() {

    override fun onRegistered(
        installationId: String
    ) {
        super.onRegistered(
            installationId
        )

        val manager =
            PushInstallationManager(
                this
            )

        /*
         * Guardamos primero el FID.
         *
         * Si todavía no existe una sesión CUSTOMER,
         * AuthViewModel lo sincronizará después del
         * próximo login/registro.
         */
        manager.storeInstallation(
            installationId
        )

        /*
         * FirebaseMessagingService ejecuta callbacks
         * fuera de la UI. La sincronización es
         * best-effort: un fallo de red no invalida
         * el FID local y se reintentará al iniciar
         * una sesión CUSTOMER.
         */
        runCatching {
            manager
                .syncCurrentInstallation()
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        /*
         * No mostramos contenido CUSTOMER si ya no
         * existe una sesión autenticada local.
         */
        if (
            !SessionStore(this)
                .hasCustomerSession()
        ) {
            return
        }

        val title =
            message.notification?.title
                ?: message.data["title"]
                ?: "VÉLORA"

        val body =
            message.notification?.body
                ?: message.data["body"]
                ?: "Tiene una nueva actualización."

        showNotification(
            title = title,
            body = body
        )
    }

    private fun showNotification(
        title: String,
        body: String
    ) {
        val intent = Intent(
            this,
            MainActivity::class.java
        ).apply {
            flags =
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or
                PendingIntent.FLAG_IMMUTABLE
        )

        val notification = Notification.Builder(
            this,
            CHANNEL_ID
        )
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        val manager =
            getSystemService(NotificationManager::class.java)

        manager.notify(
            System.currentTimeMillis().toInt(),
            notification
        )
    }

    companion object {
        const val CHANNEL_ID = "velora_customer"
    }
}