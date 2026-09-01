package com.velora.mobile.data

class ApiHttpException(
    val statusCode: Int,
    message: String
) : IllegalStateException(
    message
)