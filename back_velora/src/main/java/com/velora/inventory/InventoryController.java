package com.velora.inventory;

import java.util.List;
import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import com.velora.inventory.dto.InventoryMovementRequest;
import com.velora.inventory.dto.InventoryMovementResponse;
import com.velora.inventory.dto.InventoryStockResponse;
import com.velora.inventory.dto.WarehouseRequest;
import com.velora.inventory.dto.WarehouseResponse;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/inventory")
public class InventoryController {

    private final InventoryService inventoryService;

    public InventoryController(InventoryService inventoryService) {
        this.inventoryService = inventoryService;
    }

    @GetMapping("/warehouses")
    public List<WarehouseResponse> warehouses(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return inventoryService.listWarehouses(actorId(jwt));
    }

    @PostMapping("/warehouses")
    public WarehouseResponse createWarehouse(
            @Valid @RequestBody WarehouseRequest request,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return inventoryService.createWarehouse(
                request,
                actorId(jwt)
        );
    }

    @GetMapping("/warehouses/{warehouseId}/stock")
    public List<InventoryStockResponse> stock(
            @PathVariable UUID warehouseId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return inventoryService.listStock(
                warehouseId,
                actorId(jwt)
        );
    }

    @PostMapping("/movements")
    public InventoryStockResponse movement(
            @Valid @RequestBody InventoryMovementRequest request,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return inventoryService.registerMovement(
                request,
                actorId(jwt)
        );
    }

    @GetMapping("/warehouses/{warehouseId}/movements")
    public List<InventoryMovementResponse> history(
            @PathVariable UUID warehouseId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return inventoryService.history(
                warehouseId,
                actorId(jwt)
        );
    }

    private UUID actorId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}