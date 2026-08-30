package com.velora.customer.dto;

import jakarta.validation.constraints.*;

public record CustomerAddressRequest(

        @NotBlank(message = "El alias de la dirección es obligatorio.")
        @Size(max = 60, message = "El alias es demasiado largo.")
        String label,

        @NotBlank(message = "El destinatario es obligatorio.")
        @Size(max = 180, message = "El destinatario es demasiado largo.")
        String recipientName,

        @NotBlank(message = "El teléfono del destinatario es obligatorio.")
        @Size(max = 40, message = "El teléfono es demasiado largo.")
        String recipientPhone,

        @NotBlank(message = "El departamento es obligatorio.")
        @Size(max = 100, message = "El departamento es demasiado largo.")
        String department,

        @NotBlank(message = "La ciudad es obligatoria.")
        @Size(max = 100, message = "La ciudad es demasiado larga.")
        String city,

        @Size(max = 120, message = "La zona es demasiado larga.")
        String zone,

        @NotBlank(message = "La dirección es obligatoria.")
        @Size(max = 240, message = "La dirección es demasiado larga.")
        String addressLine,

        @Size(max = 300, message = "La referencia es demasiado larga.")
        String reference,

        boolean defaultAddress
) {}