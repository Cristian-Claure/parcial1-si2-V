package com.velora.push.dto;

import com.velora.push.PushPlatform;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record RegisterPushInstallationRequest(
        @NotBlank
        @Size(max = 255)
        String installationId,

        @NotNull
        PushPlatform platform,

        @Size(max = 160)
        String deviceLabel
) {
}
