package com.velora.audit;

import java.time.Instant;
import java.util.UUID;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/audit")
public class AuditEventController {

    private final AuditEventService audit;

    public AuditEventController(AuditEventService audit) {
        this.audit = audit;
    }

    @GetMapping
    public AuditEventPageResponse search(
            @RequestParam(required = false) UUID actorId,
            @RequestParam(required = false) String role,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String method,
            @RequestParam(required = false) Boolean success,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
            Instant from,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
            Instant to,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size
    ) {
        return audit.search(
                actorId,
                role,
                category,
                method,
                success,
                from,
                to,
                q,
                page,
                size
        );
    }
}
