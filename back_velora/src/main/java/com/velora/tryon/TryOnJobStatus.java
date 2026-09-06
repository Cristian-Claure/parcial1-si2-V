package com.velora.tryon;

public enum TryOnJobStatus {
    QUEUED,
    PROCESSING,
    SUCCEEDED,
    FAILED,
    CANCELLED;

    public boolean terminal() {
        return this == SUCCEEDED
                || this == FAILED
                || this == CANCELLED;
    }
}
