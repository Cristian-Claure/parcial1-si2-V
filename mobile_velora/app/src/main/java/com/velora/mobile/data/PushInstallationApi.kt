package com.velora.mobile.data

import java.net.URLEncoder
import org.json.JSONObject

class PushInstallationApi(
    private val client: ApiClient
) {

    fun register(
        installationId: String,
        deviceLabel: String?
    ) {
        val body =
            JSONObject()
                .put(
                    "installationId",
                    installationId
                )
                .put(
                    "platform",
                    PLATFORM
                )
                .put(
                    "deviceLabel",
                    deviceLabel
                        ?.takeIf {
                            it.isNotBlank()
                        }
                        ?: JSONObject.NULL
                )

        client.putObject(
            "/push/installations",
            body
        )
    }

    fun revoke(
        installationId: String
    ) {
        val encoded =
            URLEncoder.encode(
                installationId,
                Charsets.UTF_8.name()
            )

        client.deleteNoContent(
            "/push/installations" +
                "?platform=$PLATFORM" +
                "&installationId=$encoded"
        )
    }

    companion object {
        private const val PLATFORM =
            "ANDROID"
    }
}
