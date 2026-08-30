package com.velora.order.dto;

import java.util.UUID;

import com.velora.order.FulfillmentType;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateOrderRequest(

        @NotNull(message = "El almacén de abastecimiento es obligatorio.")
        UUID warehouseId,

        @NotNull(message = "El tipo de entrega es obligatorio.")
        FulfillmentType fulfillmentType,

        UUID addressId,

        @Size(max = 500, message = "Las observaciones son demasiado largas.")
        String notes
) {}