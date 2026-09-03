package com.velora.mobile.notifications

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Bundle
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.velora.mobile.MainActivity
import com.velora.mobile.R
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

        manager.storeInstallation(
            installationId
        )

        runCatching {
            manager
                .syncCurrentInstallation()
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        if (
            !SessionStore(this)
                .hasCustomerSession()
        ) {
            return
        }

        val title =
            message.data["title"]
                ?: message.notification?.title
                ?: "VÉLORA"

        val body =
            message.data["body"]
                ?: message.notification?.body
                ?: "Tienes una nueva actualización."

        val type =
            message.data["type"]
                ?.trim()
                ?.takeIf {
                    it.isNotEmpty()
                }

        val entityId =
            message.data["entityId"]
                ?.trim()
                ?.takeIf {
                    it.isNotEmpty()
                }

        val route =
            message.data["route"]
                ?.trim()
                ?.takeIf {
                    it.isNotEmpty()
                }

        showNotification(
            title = premiumTitle(
                type = type,
                fallback = title,
            ),
            body = body,
            type = type,
            entityId = entityId,
            route = route
        )
    }

    private fun premiumTitle(
        type: String?,
        fallback: String,
    ): String {
        return when (
            type
                ?.trim()
                ?.uppercase()
        ) {
            "ORDER_CONFIRMED" ->
                "Pedido confirmado"

            "PAYMENT_CONFIRMED" ->
                "Pago confirmado"

            "ORDER_READY_PICKUP" ->
                "Pedido listo para recoger"

            "ORDER_SHIPPED" ->
                "Tu pedido va en camino"

            "ORDER_CANCELLED" ->
                "Pedido cancelado"

            else ->
                fallback
                    .trim()
                    .takeUnless {
                        it.equals(
                            "VÉLORA",
                            ignoreCase = true,
                        )
                    }
                    ?: "Actualización de tu pedido"
        }
    }

    private fun showNotification(
        title: String,
        body: String,
        type: String?,
        entityId: String?,
        route: String?
    ) {
        val notificationId =
            listOf(
                type.orEmpty(),
                entityId.orEmpty(),
                route.orEmpty(),
                body
            )
                .joinToString("|")
                .hashCode()

        val intent = Intent(
            this,
            MainActivity::class.java
        ).apply {
            flags =
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP

            putExtra(
                PushNavigationStore.EXTRA_PUSH_TYPE,
                type
            )
            putExtra(
                PushNavigationStore.EXTRA_PUSH_ENTITY_ID,
                entityId
            )
            putExtra(
                PushNavigationStore.EXTRA_PUSH_ROUTE,
                route
            )
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            notificationId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or
                PendingIntent.FLAG_IMMUTABLE
        )

        val notification =
            Notification.Builder(
                this,
                CHANNEL_ID
            )
                .setSmallIcon(
                      R.drawable.ic_velora_notification
                  )
                  .setColor(
                      0xFFB77A63.toInt()
                  )
                  .setExtras(
                      Bundle().apply {
                          putBoolean(
                              "android.app.preferSmallIcon",
                              true,
                          )
                      }
                  )
                  .setShowWhen(
                      false
                  )
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(
                    Notification.BigTextStyle()
                        .bigText(body)
                )
                .setCategory(
                    Notification.CATEGORY_STATUS
                )
                .setVisibility(
                    Notification.VISIBILITY_PRIVATE
                )
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(true)
                .setWhen(
                    System.currentTimeMillis()
                )
                .setContentIntent(
                    pendingIntent
                )
                .build()

        val manager =
            getSystemService(
                NotificationManager::class.java
            )

        manager.notify(
            notificationId,
            notification
        )
    }

    companion object {
        const val CHANNEL_ID =
            "velora_customer_updates_v2"
    }
}
