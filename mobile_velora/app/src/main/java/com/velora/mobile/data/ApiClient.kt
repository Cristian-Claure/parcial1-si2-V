package com.velora.mobile.data

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class ApiClient(
    private val baseUrl: String =
        "http://10.0.2.2:8080/api",
    private val tokenProvider: () -> String? =
        { null }
) {

    fun getObject(
        path: String
    ): JSONObject {
        return JSONObject(
            request(
                method = "GET",
                path = path,
                body = null
            )
        )
    }

    fun getArray(
        path: String
    ): JSONArray {
        return JSONArray(
            request(
                method = "GET",
                path = path,
                body = null
            )
        )
    }

    fun postObject(
        path: String,
        body: JSONObject
    ): JSONObject {
        return JSONObject(
            request(
                method = "POST",
                path = path,
                body = body
            )
        )
    }

    fun putObject(
        path: String,
        body: JSONObject
    ): JSONObject {
        return JSONObject(
            request(
                method = "PUT",
                path = path,
                body = body
            )
        )
    }

    fun deleteObject(
        path: String
    ): JSONObject {
        return JSONObject(
            request(
                method = "DELETE",
                path = path,
                body = null
            )
        )
    }

    fun deleteNoContent(
        path: String
    ) {
        request(
            method = "DELETE",
            path = path,
            body = null
        )
    }

    private fun request(
        method: String,
        path: String,
        body: JSONObject?
    ): String {

        val token =
            tokenProvider()
                ?.takeIf {
                    it.isNotBlank()
                }
                ?: throw IllegalStateException(
                    "La sesión expiró. Inicie sesión nuevamente."
                )

        val connection =
            (
                URL(baseUrl + path)
                    .openConnection()
                    as HttpURLConnection
            ).apply {

                requestMethod = method
                connectTimeout = 10_000
                readTimeout = 10_000

                setRequestProperty(
                    "Accept",
                    "application/json"
                )

                setRequestProperty(
                    "Authorization",
                    "Bearer $token"
                )

                if (body != null) {
                    doOutput = true

                    setRequestProperty(
                        "Content-Type",
                        "application/json"
                    )
                }
            }

        try {

            if (body != null) {
                connection.outputStream.use {
                    stream ->

                    stream.write(
                        body.toString()
                            .toByteArray(
                                Charsets.UTF_8
                            )
                    )
                }
            }

            val status =
                connection.responseCode

            val stream =
                if (status in 200..299) {
                    connection.inputStream
                } else {
                    connection.errorStream
                }

            val response =
                stream
                    ?.bufferedReader(
                        Charsets.UTF_8
                    )
                    ?.use {
                        it.readText()
                    }
                    .orEmpty()

            if (status !in 200..299) {

                val serverMessage =
                    runCatching {
                        JSONObject(response)
                            .optString(
                                "message",
                                ""
                            )
                    }.getOrDefault("")

                throw ApiHttpException(
                    statusCode = status,
                    message =
                        serverMessage.ifBlank {
                            "No se pudo completar la solicitud HTTP $status."
                        }
                )
            }

            return response

        } finally {
            connection.disconnect()
        }
    }
}