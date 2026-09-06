package com.velora.mobile.data

import org.json.JSONObject
import java.io.DataOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

data class MobileTryOnJob(
    val id: String,
    val status: String,
    val errorMessage: String?,
    val durationMs: Long?
)

class TryOnApi(
    private val baseUrl: String =
        "http://10.0.2.2:8080/api",
    private val tokenProvider: () -> String?
) {

    fun createJob(
        productId: String,
        variantId: String,
        personBytes: ByteArray,
        filename: String,
        contentType: String
    ): MobileTryOnJob {
        require(personBytes.isNotEmpty()) {
            "La fotografía está vacía."
        }
        require(personBytes.size <= MAX_PERSON_BYTES) {
            "La fotografía supera 5 MB."
        }

        val boundary =
            "----VeloraTryOn" +
                UUID.randomUUID()
                    .toString()
                    .replace("-", "")

        val connection = authorizedConnection(
            path = "/customer/try-on/jobs",
            method = "POST",
            accept = "application/json"
        ).apply {
            doOutput = true
            setRequestProperty(
                "Content-Type",
                "multipart/form-data; boundary=$boundary"
            )
        }

        try {
            DataOutputStream(connection.outputStream).use { output ->
                writeTextPart(
                    output,
                    boundary,
                    "productId",
                    productId
                )
                writeTextPart(
                    output,
                    boundary,
                    "variantId",
                    variantId
                )
                writeFilePart(
                    output = output,
                    boundary = boundary,
                    name = "person",
                    filename = safeFilename(filename),
                    contentType = contentType,
                    bytes = personBytes
                )
                output.writeBytes("--$boundary--\r\n")
                output.flush()
            }

            return parseJob(readJsonResponse(connection))
        } finally {
            connection.disconnect()
        }
    }

    fun getJob(jobId: String): MobileTryOnJob {
        val connection = authorizedConnection(
            path = "/customer/try-on/jobs/$jobId",
            method = "GET",
            accept = "application/json"
        )
        try {
            return parseJob(readJsonResponse(connection))
        } finally {
            connection.disconnect()
        }
    }

    fun cancelJob(jobId: String): MobileTryOnJob {
        val connection = authorizedConnection(
            path = "/customer/try-on/jobs/$jobId",
            method = "DELETE",
            accept = "application/json"
        )
        try {
            val response = readResponseText(connection)
            if (response.isBlank()) {
                return MobileTryOnJob(
                    id = jobId,
                    status = "CANCELLED",
                    errorMessage = null,
                    durationMs = null
                )
            }
            return parseJob(JSONObject(response))
        } finally {
            connection.disconnect()
        }
    }

    fun result(jobId: String): ByteArray {
        val connection = authorizedConnection(
            path = "/customer/try-on/jobs/$jobId/result",
            method = "GET",
            accept = "image/png,image/jpeg,image/webp"
        )
        try {
            val status = connection.responseCode
            if (status !in 200..299) {
                throw IllegalStateException(
                    serverError(connection, status)
                )
            }
            return connection.inputStream.use { it.readBytes() }
        } finally {
            connection.disconnect()
        }
    }

    private fun authorizedConnection(
        path: String,
        method: String,
        accept: String
    ): HttpURLConnection {
        val token = tokenProvider()
            ?.takeIf { it.isNotBlank() }
            ?: throw IllegalStateException(
                "La sesión expiró. Inicie sesión nuevamente."
            )

        return (
            URL(baseUrl + path).openConnection()
                as HttpURLConnection
            ).apply {
                requestMethod = method
                connectTimeout = 15_000
                readTimeout = 120_000
                setRequestProperty("Accept", accept)
                setRequestProperty(
                    "Authorization",
                    "Bearer $token"
                )
            }
    }

    private fun readJsonResponse(
        connection: HttpURLConnection
    ): JSONObject {
        val response = readResponseText(connection)
        if (response.isBlank()) {
            throw IllegalStateException(
                "El servidor devolvió una respuesta vacía."
            )
        }
        return JSONObject(response)
    }

    private fun readResponseText(
        connection: HttpURLConnection
    ): String {
        val status = connection.responseCode
        if (status !in 200..299) {
            throw IllegalStateException(
                serverError(connection, status)
            )
        }
        return connection.inputStream
            ?.bufferedReader(Charsets.UTF_8)
            ?.use { it.readText() }
            .orEmpty()
    }

    private fun serverError(
        connection: HttpURLConnection,
        status: Int
    ): String {
        val response = connection.errorStream
            ?.bufferedReader(Charsets.UTF_8)
            ?.use { it.readText() }
            .orEmpty()

        val message = runCatching {
            JSONObject(response).optString("message", "")
        }.getOrDefault("")

        return message.ifBlank {
            "No se pudo completar el probador virtual (HTTP $status)."
        }
    }

    private fun parseJob(json: JSONObject): MobileTryOnJob =
        MobileTryOnJob(
            id = json.getString("id"),
            status = json.optString("status", "QUEUED"),
            errorMessage = nullableString(
                json,
                "errorMessage"
            ),
            durationMs = nullableLong(
                json,
                "durationMs"
            )
        )

    private fun nullableString(
        json: JSONObject,
        key: String
    ): String? {
        if (!json.has(key) || json.isNull(key)) {
            return null
        }
        return json.optString(key)
            .takeIf { it.isNotBlank() }
    }

    private fun nullableLong(
        json: JSONObject,
        key: String
    ): Long? {
        if (!json.has(key) || json.isNull(key)) {
            return null
        }
        return runCatching {
            json.getLong(key)
        }.getOrNull()
    }

    private fun writeTextPart(
        output: DataOutputStream,
        boundary: String,
        name: String,
        value: String
    ) {
        output.writeBytes("--$boundary\r\n")
        output.writeBytes(
            "Content-Disposition: form-data; name=\"$name\"\r\n"
        )
        output.writeBytes(
            "Content-Type: text/plain; charset=UTF-8\r\n\r\n"
        )
        output.write(
            value.toByteArray(Charsets.UTF_8)
        )
        output.writeBytes("\r\n")
    }

    private fun writeFilePart(
        output: DataOutputStream,
        boundary: String,
        name: String,
        filename: String,
        contentType: String,
        bytes: ByteArray
    ) {
        output.writeBytes("--$boundary\r\n")
        output.writeBytes(
            "Content-Disposition: form-data; " +
                "name=\"$name\"; filename=\"$filename\"\r\n"
        )
        output.writeBytes(
            "Content-Type: $contentType\r\n\r\n"
        )
        output.write(bytes)
        output.writeBytes("\r\n")
    }

    private fun safeFilename(value: String): String {
        val cleaned = value
            .replace(
                Regex("""[^A-Za-z0-9._-]"""),
                "_"
            )
            .take(120)

        return cleaned.ifBlank {
            "velora-person.jpg"
        }
    }

    companion object {
        private const val MAX_PERSON_BYTES =
            5 * 1024 * 1024
    }
}
