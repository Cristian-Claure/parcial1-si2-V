package com.velora.inventory;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.velora.catalog.variant.ProductVariantEntity;
import com.velora.catalog.variant.ProductVariantRepository;
import com.velora.inventory.dto.InventoryMovementRequest;
import com.velora.inventory.dto.InventoryMovementResponse;
import com.velora.inventory.dto.InventoryStockResponse;
import com.velora.inventory.dto.WarehouseRequest;
import com.velora.inventory.dto.WarehouseResponse;
import com.velora.store.StoreEntity;
import com.velora.store.StoreRepository;
import com.velora.user.UserEntity;
import com.velora.user.UserRepository;
import com.velora.user.UserRole;

@Service
@Transactional
public class InventoryService {

    private final WarehouseRepository warehouseRepository;
    private final InventoryStockRepository stockRepository;
    private final InventoryMovementRepository movementRepository;
    private final StoreRepository storeRepository;
    private final ProductVariantRepository variantRepository;
    private final UserRepository userRepository;

    public InventoryService(
            WarehouseRepository warehouseRepository,
            InventoryStockRepository stockRepository,
            InventoryMovementRepository movementRepository,
            StoreRepository storeRepository,
            ProductVariantRepository variantRepository,
            UserRepository userRepository
    ) {
        this.warehouseRepository = warehouseRepository;
        this.stockRepository = stockRepository;
        this.movementRepository = movementRepository;
        this.storeRepository = storeRepository;
        this.variantRepository = variantRepository;
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public List<WarehouseResponse> listWarehouses(UUID actorId) {
        UserEntity actor = requireActor(actorId);

        if (actor.getRole() == UserRole.ADMIN) {
            return warehouseRepository.findAllByOrderByNameAsc()
                    .stream()
                    .map(this::toWarehouseResponse)
                    .toList();
        }

        StoreEntity store = requireManagerStore(actor);

        return warehouseRepository
                .findAllByStore_IdOrderByNameAsc(store.getId())
                .stream()
                .map(this::toWarehouseResponse)
                .toList();
    }

    public WarehouseResponse createWarehouse(
            WarehouseRequest request,
            UUID actorId
    ) {
        UserEntity actor = requireActor(actorId);
        StoreEntity store = storeRepository.findById(request.storeId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Sucursal no encontrada."
                ));

        validateStoreAccess(actor, store);

        if (!store.isActive()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "La sucursal está inactiva."
            );
        }

        String code = request.code().trim().toUpperCase();

        if (warehouseRepository.existsByStore_IdAndCodeIgnoreCase(
                store.getId(),
                code
        )) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Ya existe un almacén con ese código en la sucursal."
            );
        }

        WarehouseEntity entity = new WarehouseEntity();
        entity.setStore(store);
        entity.setCode(code);
        entity.setName(request.name());
        entity.setDescription(request.description());
        entity.setActive(request.active() == null || request.active());

        return toWarehouseResponse(warehouseRepository.save(entity));
    }

    @Transactional(readOnly = true)
    public List<InventoryStockResponse> listStock(
            UUID warehouseId,
            UUID actorId
    ) {
        UserEntity actor = requireActor(actorId);
        WarehouseEntity warehouse = requireWarehouse(warehouseId);

        validateStoreAccess(actor, warehouse.getStore());

        return stockRepository.findAllForWarehouse(warehouseId)
                .stream()
                .map(this::toStockResponse)
                .toList();
    }

    public InventoryStockResponse registerMovement(
            InventoryMovementRequest request,
            UUID actorId
    ) {
        UserEntity actor = requireActor(actorId);
        WarehouseEntity warehouse = requireWarehouse(request.warehouseId());

        validateStoreAccess(actor, warehouse.getStore());

        if (!warehouse.isActive()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "El almacén está inactivo."
            );
        }

        ProductVariantEntity variant = variantRepository
                .findById(request.variantId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Variante no encontrada."
                ));

        if (!variant.isActive()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "La variante está inactiva."
            );
        }

        validateManualMovementType(request.movementType());

        InventoryStockEntity stock = stockRepository
                .findForUpdate(warehouse.getId(), variant.getId())
                .orElseGet(() -> {
                    InventoryStockEntity created = new InventoryStockEntity();
                    created.setWarehouse(warehouse);
                    created.setVariant(variant);
                    created.setPhysicalQuantity(0);
                    created.setCommittedQuantity(0);
                    return stockRepository.saveAndFlush(created);
                });

        int physicalBefore = stock.getPhysicalQuantity();
        int committedBefore = stock.getCommittedQuantity();

        int physicalDelta = physicalDelta(
                request.movementType(),
                request.quantity()
        );

        int physicalAfter = physicalBefore + physicalDelta;
        int committedAfter = committedBefore;

        if (physicalAfter < 0) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Stock físico insuficiente."
            );
        }

        if (committedAfter > physicalAfter) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El movimiento dejaría stock físico por debajo del stock comprometido."
            );
        }

        stock.setPhysicalQuantity(physicalAfter);
        stockRepository.saveAndFlush(stock);

        InventoryMovementEntity movement = new InventoryMovementEntity();
        movement.setWarehouse(warehouse);
        movement.setVariant(variant);
        movement.setMovementType(request.movementType());
        movement.setQuantity(request.quantity());

        movement.setPhysicalDelta(physicalDelta);
        movement.setCommittedDelta(0);

        movement.setPhysicalBefore(physicalBefore);
        movement.setPhysicalAfter(physicalAfter);

        movement.setCommittedBefore(committedBefore);
        movement.setCommittedAfter(committedAfter);

        movement.setReason(request.reason().trim());
        movement.setReferenceType(trimToNull(request.referenceType()));
        movement.setReferenceId(request.referenceId());
        movement.setPerformedBy(actor);

        movementRepository.save(movement);

        return toStockResponse(stock);
    }

    @Transactional(readOnly = true)
    public List<InventoryMovementResponse> history(
            UUID warehouseId,
            UUID actorId
    ) {
        UserEntity actor = requireActor(actorId);
        WarehouseEntity warehouse = requireWarehouse(warehouseId);

        validateStoreAccess(actor, warehouse.getStore());

        return movementRepository.findHistory(warehouseId)
                .stream()
                .map(this::toMovementResponse)
                .toList();
    }

    private void validateManualMovementType(
            InventoryMovementType movementType
    ) {
        if (movementType == InventoryMovementType.RESERVE
                || movementType == InventoryMovementType.RELEASE
                || movementType == InventoryMovementType.SALE) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "RESERVE, RELEASE y SALE son movimientos internos y serán gestionados por pedidos/ventas."
            );
        }
    }

    private int physicalDelta(
            InventoryMovementType type,
            int quantity
    ) {
        return switch (type) {
            case ENTRY,
                 ADJUSTMENT_IN,
                 RETURN,
                 TRANSFER_IN -> quantity;

            case ADJUSTMENT_OUT,
                 TRANSFER_OUT -> -quantity;

            case RESERVE,
                 RELEASE,
                 SALE -> throw new IllegalArgumentException(
                    "Movimiento no disponible manualmente."
            );
        };
    }

    private void validateStoreAccess(
            UserEntity actor,
            StoreEntity store
    ) {
        if (actor.getRole() == UserRole.ADMIN) {
            return;
        }

        if (actor.getRole() != UserRole.STORE_MANAGER) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "No tiene permisos para gestionar inventario."
            );
        }

        StoreEntity assignedStore = requireManagerStore(actor);

        if (!assignedStore.getId().equals(store.getId())) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "No puede gestionar inventario de otra sucursal."
            );
        }
    }

    private StoreEntity requireManagerStore(UserEntity actor) {
        if (actor.getStore() == null) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "El encargado no tiene una sucursal asignada."
            );
        }

        return actor.getStore();
    }

    private UserEntity requireActor(UUID actorId) {
        return userRepository.findById(actorId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED,
                        "Usuario autenticado no encontrado."
                ));
    }

    private WarehouseEntity requireWarehouse(UUID id) {
        return warehouseRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Almacén no encontrado."
                ));
    }

    private String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        return value.trim();
    }

    private WarehouseResponse toWarehouseResponse(
            WarehouseEntity entity
    ) {
        return new WarehouseResponse(
                entity.getId(),
                entity.getStore().getId(),
                entity.getStore().getName(),
                entity.getCode(),
                entity.getName(),
                entity.getDescription(),
                entity.isActive()
        );
    }

    private InventoryStockResponse toStockResponse(
            InventoryStockEntity entity
    ) {
        ProductVariantEntity variant = entity.getVariant();

        return new InventoryStockResponse(
                entity.getId(),
                entity.getWarehouse().getId(),
                variant.getId(),
                variant.getProduct().getName(),
                variant.getSku(),
                variant.getSize(),
                variant.getColor(),
                entity.getPhysicalQuantity(),
                entity.getCommittedQuantity(),
                entity.getAvailableQuantity(),
                entity.getVersion()
        );
    }

    private InventoryMovementResponse toMovementResponse(
            InventoryMovementEntity entity
    ) {
        UserEntity actor = entity.getPerformedBy();

        return new InventoryMovementResponse(
                entity.getId(),
                entity.getWarehouse().getId(),
                entity.getVariant().getId(),
                entity.getVariant().getSku(),
                entity.getMovementType(),
                entity.getQuantity(),
                entity.getPhysicalDelta(),
                entity.getCommittedDelta(),
                entity.getPhysicalBefore(),
                entity.getPhysicalAfter(),
                entity.getCommittedBefore(),
                entity.getCommittedAfter(),
                entity.getReason(),
                actor == null
                        ? null
                        : actor.getFirstName() + " " + actor.getLastName(),
                entity.getCreatedAt()
        );
    }
}