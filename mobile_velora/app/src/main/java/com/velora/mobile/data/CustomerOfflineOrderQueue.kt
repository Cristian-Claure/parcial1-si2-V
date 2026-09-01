package com.velora.mobile.data

import android.content.Context
import java.io.IOException
import java.time.Instant

enum class MobileOfflineSyncState {
    SYNCED,
    PENDING,
    CONFLICT
}

data class MobileOfflineSyncOutcome(
    val clientOperationId:
        String,
    val state:
        MobileOfflineSyncState,
    val order:
        MobileOrder? = null,
    val message:
        String? = null
)

class CustomerOfflineOrderQueue(
    context: Context
) {

    private val session =
        SessionStore(
            context
        )

    private val store =
        CustomerOfflineStore(
            context
        )

    private val codec =
        OfflineOrderQueueCodec()

    private val orderApi =
        OrderApi(
            ApiClient(
                tokenProvider = {
                    session.token()
                }
            )
        )

    @Synchronized
    fun enqueue(
        request:
            MobileOfflineOrderRequest
    ): MobileOfflineOrderQueueEntry {

        validateRequest(
            request
        )

        val current =
            readEntries()

        val existing =
            current.firstOrNull {
                it.clientOperationId ==
                    request.clientOperationId
            }

        if (existing != null) {

            require(
                existing.request ==
                    request
            ) {
                "clientOperationId ya existe con un snapshot diferente."
            }

            return existing
        }

        val now =
            Instant.now()
                .toString()

        val entry =
            MobileOfflineOrderQueueEntry(
                request =
                    request,

                status =
                    MobileOfflineOrderQueueStatus.PENDING,

                conflictMessage =
                    null,

                createdAt =
                    now,

                updatedAt =
                    now
            )

        writeEntries(
            current +
                entry
        )

        return entry
    }

    @Synchronized
    fun entries():
        List<MobileOfflineOrderQueueEntry> {

        return readEntries()
    }

    @Synchronized
    fun pendingCount():
        Int {

        return readEntries()
            .count {
                it.status ==
                    MobileOfflineOrderQueueStatus.PENDING ||
                it.status ==
                    MobileOfflineOrderQueueStatus.SYNCING
            }
    }

    @Synchronized
    fun conflictCount():
        Int {

        return readEntries()
            .count {
                it.status ==
                    MobileOfflineOrderQueueStatus.CONFLICT
            }
    }

    @Synchronized
    fun recoverStaleSyncing():
        Int {

        val current =
            readEntries()

        var recovered =
            0

        val now =
            Instant.now()
                .toString()

        val updated =
            current.map {
                entry ->

                if (
                    entry.status ==
                        MobileOfflineOrderQueueStatus.SYNCING
                ) {
                    recovered += 1

                    entry.copy(
                        status =
                            MobileOfflineOrderQueueStatus.PENDING,

                        conflictMessage =
                            null,

                        updatedAt =
                            now
                    )
                }
                else {
                    entry
                }
            }

        if (recovered > 0) {
            writeEntries(
                updated
            )
        }

        return recovered
    }

    @Synchronized
    fun retryConflict(
        clientOperationId:
            String
    ): Boolean {

        val current =
            readEntries()

        val target =
            current.firstOrNull {
                it.clientOperationId ==
                    clientOperationId
            }
                ?: return false

        if (
            target.status !=
                MobileOfflineOrderQueueStatus.CONFLICT
        ) {
            return false
        }

        val now =
            Instant.now()
                .toString()

        writeEntries(
            current.map {
                entry ->

                if (
                    entry.clientOperationId ==
                        clientOperationId
                ) {
                    entry.copy(
                        status =
                            MobileOfflineOrderQueueStatus.PENDING,

                        conflictMessage =
                            null,

                        updatedAt =
                            now
                    )
                }
                else {
                    entry
                }
            }
        )

        return true
    }

    @Synchronized
    fun acknowledgeSynced(
        clientOperationId:
            String
    ) {

        val current =
            readEntries()

        val updated =
            current.filterNot {
                it.clientOperationId ==
                    clientOperationId
            }

        if (
            updated.size !=
                current.size
        ) {
            writeEntries(
                updated
            )
        }
    }

    @Synchronized
    fun discard(
        clientOperationId:
            String
    ): Boolean {

        val current =
            readEntries()

        val updated =
            current.filterNot {
                it.clientOperationId ==
                    clientOperationId
            }

        if (
            updated.size ==
                current.size
        ) {
            return false
        }

        writeEntries(
            updated
        )

        return true
    }

    @Synchronized
    fun syncOperation(
        clientOperationId:
            String
    ): MobileOfflineSyncOutcome {

        var current =
            readEntries()

        val target =
            current.firstOrNull {
                it.clientOperationId ==
                    clientOperationId
            }
                ?: throw IllegalArgumentException(
                    "La operación offline no existe."
                )

        if (
            target.status ==
                MobileOfflineOrderQueueStatus.CONFLICT
        ) {
            return MobileOfflineSyncOutcome(
                clientOperationId =
                    clientOperationId,

                state =
                    MobileOfflineSyncState.CONFLICT,

                message =
                    target.conflictMessage
            )
        }

        val syncing =
            target.copy(
                status =
                    MobileOfflineOrderQueueStatus.SYNCING,

                conflictMessage =
                    null,

                updatedAt =
                    Instant.now()
                        .toString()
            )

        current =
            current.map {
                entry ->

                if (
                    entry.clientOperationId ==
                        clientOperationId
                ) {
                    syncing
                }
                else {
                    entry
                }
            }

        writeEntries(
            current
        )

        try {

            val order =
                orderApi.syncOffline(
                    syncing.request
                )

            return MobileOfflineSyncOutcome(
                clientOperationId =
                    clientOperationId,

                state =
                    MobileOfflineSyncState.SYNCED,

                order =
                    order
            )

        } catch (
            exception: IOException
        ) {

            updateStatus(
                clientOperationId =
                    clientOperationId,

                status =
                    MobileOfflineOrderQueueStatus.PENDING,

                message =
                    null
            )

            return MobileOfflineSyncOutcome(
                clientOperationId =
                    clientOperationId,

                state =
                    MobileOfflineSyncState.PENDING,

                message =
                    "Sin conexión. El pedido continúa pendiente."
            )

        } catch (
            exception: ApiHttpException
        ) {

            if (
                exception.statusCode ==
                    409
            ) {
                val message =
                    exception.message
                        ?: "El pedido necesita revisión antes de sincronizarse."

                updateStatus(
                    clientOperationId =
                        clientOperationId,

                    status =
                        MobileOfflineOrderQueueStatus.CONFLICT,

                    message =
                        message
                )

                return MobileOfflineSyncOutcome(
                    clientOperationId =
                        clientOperationId,

                    state =
                        MobileOfflineSyncState.CONFLICT,

                    message =
                        message
                )
            }

            updateStatus(
                clientOperationId =
                    clientOperationId,

                status =
                    MobileOfflineOrderQueueStatus.PENDING,

                message =
                    null
            )

            throw exception

        } catch (
            exception: Exception
        ) {

            updateStatus(
                clientOperationId =
                    clientOperationId,

                status =
                    MobileOfflineOrderQueueStatus.PENDING,

                message =
                    null
            )

            throw exception
        }
    }

    @Synchronized
    fun syncPending():
        List<MobileOfflineSyncOutcome> {

        recoverStaleSyncing()

        val operations =
            readEntries()
                .filter {
                    it.status ==
                        MobileOfflineOrderQueueStatus.PENDING
                }
                .map {
                    it.clientOperationId
                }

        val outcomes =
            mutableListOf<
                MobileOfflineSyncOutcome
            >()

        for (
            operationId in
            operations
        ) {

            val outcome =
                syncOperation(
                    operationId
                )

            outcomes.add(
                outcome
            )

            if (
                outcome.state ==
                    MobileOfflineSyncState.PENDING
            ) {
                break
            }
        }

        return outcomes
    }

    private fun updateStatus(
        clientOperationId:
            String,
        status:
            MobileOfflineOrderQueueStatus,
        message:
            String?
    ) {

        val current =
            readEntries()

        val now =
            Instant.now()
                .toString()

        writeEntries(
            current.map {
                entry ->

                if (
                    entry.clientOperationId ==
                        clientOperationId
                ) {
                    entry.copy(
                        status =
                            status,

                        conflictMessage =
                            message,

                        updatedAt =
                            now
                    )
                }
                else {
                    entry
                }
            }
        )
    }

    private fun readEntries():
        List<MobileOfflineOrderQueueEntry> {

        val payload =
            store.load(
                CustomerOfflineScope.ORDER_QUEUE
            )
                ?: return emptyList()

        return codec.decode(
            payload
        )
    }

    private fun writeEntries(
        entries:
            List<MobileOfflineOrderQueueEntry>
    ) {

        store.save(
            CustomerOfflineScope.ORDER_QUEUE,
            codec.encode(
                entries
            )
        )
    }

    private fun validateRequest(
        request:
            MobileOfflineOrderRequest
    ) {

        require(
            request.clientOperationId
                .isNotBlank()
        )

        require(
            request.clientCreatedAt
                .isNotBlank()
        )

        require(
            request.warehouseId
                .isNotBlank()
        )

        require(
            request.items
                .isNotEmpty()
        )

        require(
            request.items
                .all {
                    it.variantId
                        .isNotBlank() &&
                    it.quantity >
                        0
                }
        )
    }
}