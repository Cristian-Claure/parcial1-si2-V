package com.velora.mobile.data

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class MobileUser(
    val id: String,
    val firstName: String,
    val lastName: String,
    val email: String,
    val role: String
)

data class MobileAuthResponse(
    val accessToken: String,
    val user: MobileUser
)

class AuthApi(
    private val baseUrl: String = "http://10.0.2.2:8080/api"
) {
    fun login(email: String, password: String): MobileAuthResponse {
        return post(
            "/auth/login",
            JSONObject()
                .put("email", email)
                .put("password", password)
        )
    }

    fun register(
        firstName: String,
        lastName: String,
        email: String,
        password: String
    ): MobileAuthResponse {
        return post(
            "/auth/register",
            JSONObject()
                .put("firstName", firstName)
                .put("lastName", lastName)
                .put("email", email)
                .put("password", password)
        )
    }

    private fun post(path: String, body: JSONObject): MobileAuthResponse {
        val connection = (URL(baseUrl + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 10_000
            readTimeout = 10_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Accept", "application/json")
        }

        connection.outputStream.use {
            it.write(body.toString().toByteArray(Charsets.UTF_8))
        }

        val status = connection.responseCode
        val stream = if (status in 200..299) connection.inputStream else connection.errorStream
        val responseText = stream.bufferedReader().use { it.readText() }
        val json = JSONObject(responseText)

        if (status !in 200..299) {
            throw IllegalStateException(
                json.optString("message", "No se pudo completar la solicitud.")
            )
        }

        val userJson = json.getJSONObject("user")
        return MobileAuthResponse(
            accessToken = json.getString("accessToken"),
            user = MobileUser(
                id = userJson.getString("id"),
                firstName = userJson.getString("firstName"),
                lastName = userJson.getString("lastName"),
                email = userJson.getString("email"),
                role = userJson.getString("role")
            )
        )
    }
}
