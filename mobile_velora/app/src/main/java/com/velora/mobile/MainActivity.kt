package com.velora.mobile

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.velora.mobile.notifications.VeloraMessagingService
import com.velora.mobile.ui.VeloraMobileApp
import com.velora.mobile.ui.theme.VeloraTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        configureNotifications()

        setContent {
            VeloraTheme {
                VeloraMobileApp()
            }
        }
    }

    private fun configureNotifications() {
        createNotificationChannel()
        requestNotificationPermission()
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            VeloraMessagingService.CHANNEL_ID,
            "VÉLORA",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description =
                "Actualizaciones de pedidos, novedades y experiencia VÉLORA."
        }

        val manager =
            getSystemService(NotificationManager::class.java)

        manager.createNotificationChannel(channel)
    }

    private fun requestNotificationPermission() {
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                NOTIFICATION_PERMISSION_REQUEST
            )
        }
    }

    companion object {
        private const val NOTIFICATION_PERMISSION_REQUEST = 1001
    }
}