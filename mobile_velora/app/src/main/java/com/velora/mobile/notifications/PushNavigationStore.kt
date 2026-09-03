package com.velora.mobile.notifications

import android.content.Intent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class PushNavigationRequest(
    val id: Long,
    val type: String?,
    val entityId: String?,
    val route: String?
)

object PushNavigationStore {

    private val _request =
        MutableStateFlow<PushNavigationRequest?>(
            null
        )

    val request:
        StateFlow<PushNavigationRequest?> =
            _request.asStateFlow()

    fun publish(intent: Intent?) {
        if (intent == null) {
            return
        }

        val type =
            (
                intent.getStringExtra(
                    EXTRA_PUSH_TYPE
                )
                    ?: intent.getStringExtra(
                        "type"
                    )
            )
                ?.trim()
                ?.takeIf {
                    it.isNotEmpty()
                }

        val entityId =
            (
                intent.getStringExtra(
                    EXTRA_PUSH_ENTITY_ID
                )
                    ?: intent.getStringExtra(
                        "entityId"
                    )
            )
                ?.trim()
                ?.takeIf {
                    it.isNotEmpty()
                }

        val route =
            (
                intent.getStringExtra(
                    EXTRA_PUSH_ROUTE
                )
                    ?: intent.getStringExtra(
                        "route"
                    )
            )
                ?.trim()
                ?.takeIf {
                    it.isNotEmpty()
                }

        if (
            type == null &&
            entityId == null &&
            route == null
        ) {
            return
        }

        _request.value =
            PushNavigationRequest(
                id = System.nanoTime(),
                type = type,
                entityId = entityId,
                route = route
            )
    }

    fun consume(id: Long) {
        if (
            _request.value?.id == id
        ) {
            _request.value = null
        }
    }

    const val EXTRA_PUSH_TYPE =
        "velora.push.type"

    const val EXTRA_PUSH_ENTITY_ID =
        "velora.push.entityId"

    const val EXTRA_PUSH_ROUTE =
        "velora.push.route"
}
