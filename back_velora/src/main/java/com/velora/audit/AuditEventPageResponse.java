package com.velora.audit;

import java.util.List;

import org.springframework.data.domain.Page;

public record AuditEventPageResponse(
        List<AuditEventResponse> content,
        long totalElements,
        int totalPages,
        int page,
        int size
) {
    static AuditEventPageResponse from(Page<AuditEventEntity> result) {
        return new AuditEventPageResponse(
                result.getContent()
                        .stream()
                        .map(AuditEventResponse::from)
                        .toList(),
                result.getTotalElements(),
                result.getTotalPages(),
                result.getNumber(),
                result.getSize()
        );
    }
}
