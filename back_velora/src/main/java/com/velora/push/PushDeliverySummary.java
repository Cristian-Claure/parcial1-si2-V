package com.velora.push;

public record PushDeliverySummary(
        boolean firebaseEnabled,
        int registeredInstallations,
        int sent,
        int failed
) {

    public static PushDeliverySummary disabled(
            int registeredInstallations
    ) {
        return new PushDeliverySummary(
                false,
                registeredInstallations,
                0,
                0
        );
    }
}
