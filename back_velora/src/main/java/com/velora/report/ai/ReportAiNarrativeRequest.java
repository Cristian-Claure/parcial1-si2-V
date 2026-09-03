package com.velora.report.ai;

import java.time.LocalDate;
import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ReportAiNarrativeRequest(
        @NotBlank(message = "La consulta del reporte es obligatoria.")
        @Size(
                min = 2,
                max = 800,
                message = "La consulta debe tener entre 2 y 800 caracteres."
        )
        String question,
        LocalDate fromDate,
        LocalDate toDate,
        UUID storeId
) {}