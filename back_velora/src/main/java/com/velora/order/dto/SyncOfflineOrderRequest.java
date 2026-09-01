package com.velora.order.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.velora.order.FulfillmentType;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record SyncOfflineOrderRequest(

        @NotNull(message = "El identificador de operación es obligatorio.")
        UUID clientOperationId,

        @NotNull(message = "La fecha local de creación es obligatoria.")
        Instant clientCreatedAt,
        UUID sourceCartId,

        @NotNull(message = "El almacén de abastecimiento es obligatorio.")
        UUID warehouseId,

        @NotNull(message = "El tipo de entrega es obligatorio.")
        FulfillmentType fulfillmentType,

        UUID addressId,

        @Size(
                max = 500,
                message = "Las observaciones son demasiado largas."
        )
        String notes,

        @NotNull(message = "Los productos del pedido son obligatorios.")
        @Size(
                min = 1,
                max = 100,
                message = "El pedido debe contener entre 1 y 100 productos."
        )
        List<@Valid OfflineOrderItemRequest> items
) {}
