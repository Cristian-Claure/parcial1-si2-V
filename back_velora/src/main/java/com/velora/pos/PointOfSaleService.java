package com.velora.pos;

import java.util.List;
import java.util.UUID;

import com.velora.inventory.WarehouseEntity;
import com.velora.inventory.WarehouseRepository;
import com.velora.pos.dto.CreatePointOfSaleRequest;
import com.velora.pos.dto.PointOfSaleResponse;
import com.velora.pos.dto.UpdatePointOfSaleRequest;
import com.velora.store.StoreEntity;
import com.velora.store.StoreRepository;
import com.velora.user.UserEntity;
import com.velora.user.UserRepository;
import com.velora.user.UserRole;
import com.velora.user.UserStatus;

import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PointOfSaleService {

    private final PointOfSaleRepository points;
    private final CashSessionRepository cashSessions;
    private final StoreRepository stores;
    private final WarehouseRepository warehouses;
    private final UserRepository users;

    public PointOfSaleService(
            PointOfSaleRepository points,
            CashSessionRepository cashSessions,
            StoreRepository stores,
            WarehouseRepository warehouses,
            UserRepository users
    ) {
        this.points = points;
        this.cashSessions = cashSessions;
        this.stores = stores;
        this.warehouses = warehouses;
        this.users = users;
    }

    @Transactional
    public PointOfSaleResponse create(
            UUID actorId,
            CreatePointOfSaleRequest request
    ) {
        requireAdmin(actorId);

        StoreEntity store = stores
                .findById(request.storeId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Sucursal no encontrada."
                ));

        if (!store.isActive()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "La sucursal está inactiva."
            );
        }

        WarehouseEntity warehouse =
                requireWarehouseForStore(
                        request.warehouseId(),
                        store.getId()
                );

        String code = normalizeCode(
                request.code()
        );

        if (points.existsByStore_IdAndCodeIgnoreCase(
                store.getId(),
                code
        )) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Ya existe un punto de venta con ese código en la sucursal."
            );
        }

        PointOfSaleEntity entity =
                new PointOfSaleEntity();

        entity.setStore(store);
        entity.setWarehouse(warehouse);
        entity.setCode(code);
        entity.setName(request.name());
        entity.setActive(true);

        points.saveAndFlush(entity);

        return PointOfSaleResponse.from(entity);
    }

    @Transactional
    public PointOfSaleResponse update(
            UUID actorId,
            UUID pointOfSaleId,
            UpdatePointOfSaleRequest request
    ) {
        requireAdmin(actorId);

        PointOfSaleEntity entity = points
                .findById(pointOfSaleId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Punto de venta no encontrado."
                ));

        WarehouseEntity warehouse =
                requireWarehouseForStore(
                        request.warehouseId(),
                        entity.getStore().getId()
                );

        String code = normalizeCode(
                request.code()
        );

        if (!entity.getCode()
                .equalsIgnoreCase(code)
                && points.existsByStore_IdAndCodeIgnoreCase(
                        entity.getStore().getId(),
                        code
                )) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Ya existe un punto de venta con ese código en la sucursal."
            );
        }

        if (!request.active()
                && entity.isActive()
                && cashSessions
                .existsByPointOfSale_IdAndStatus(
                        entity.getId(),
                        CashSessionStatus.OPEN
                )) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "No se puede desactivar un punto de venta con una caja abierta."
            );
        }

        entity.setWarehouse(warehouse);
        entity.setCode(code);
        entity.setName(request.name());
        entity.setActive(request.active());

        points.saveAndFlush(entity);

        return PointOfSaleResponse.from(entity);
    }

    @Transactional(readOnly = true)
    public List<PointOfSaleResponse> listAdmin(
            UUID actorId
    ) {
        requireAdmin(actorId);

        return points
                .findAll(
                        Sort.by(
                                Sort.Direction.ASC,
                                "name"
                        )
                )
                .stream()
                .map(PointOfSaleResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public PointOfSaleResponse getAdmin(
            UUID actorId,
            UUID pointOfSaleId
    ) {
        requireAdmin(actorId);

        PointOfSaleEntity entity = points
                .findById(pointOfSaleId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Punto de venta no encontrado."
                ));

        return PointOfSaleResponse.from(entity);
    }

    @Transactional(readOnly = true)
    public List<PointOfSaleResponse> listManager(
            UUID actorId
    ) {
        UserEntity manager =
                requireManager(actorId);

        UUID storeId =
                manager.getStore().getId();

        return points
                .findAllByStore_IdOrderByNameAsc(
                        storeId
                )
                .stream()
                .map(PointOfSaleResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public PointOfSaleResponse getManager(
            UUID actorId,
            UUID pointOfSaleId
    ) {
        UserEntity manager =
                requireManager(actorId);

        PointOfSaleEntity entity = points
                .findByIdAndStore_Id(
                        pointOfSaleId,
                        manager.getStore().getId()
                )
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Punto de venta no encontrado para su sucursal."
                ));

        return PointOfSaleResponse.from(entity);
    }

    private WarehouseEntity requireWarehouseForStore(
            UUID warehouseId,
            UUID storeId
    ) {
        WarehouseEntity warehouse = warehouses
                .findById(warehouseId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Almacén no encontrado."
                ));

        if (!warehouse.isActive()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El almacén está inactivo."
            );
        }

        if (!warehouse.getStore()
                .getId()
                .equals(storeId)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El almacén no pertenece a la sucursal seleccionada."
            );
        }

        return warehouse;
    }

    private UserEntity requireAdmin(
            UUID actorId
    ) {
        UserEntity user =
                requireActiveUser(actorId);

        if (user.getRole()
                != UserRole.ADMIN) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Se requiere rol ADMIN."
            );
        }

        return user;
    }

    private UserEntity requireManager(
            UUID actorId
    ) {
        UserEntity user =
                requireActiveUser(actorId);

        if (user.getRole()
                != UserRole.STORE_MANAGER) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Se requiere rol STORE_MANAGER."
            );
        }

        if (user.getStore() == null) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El encargado no tiene una sucursal asignada."
            );
        }

        return user;
    }

    private UserEntity requireActiveUser(
            UUID actorId
    ) {
        UserEntity user = users
                .findById(actorId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED,
                        "Usuario autenticado no encontrado."
                ));

        if (user.getStatus()
                != UserStatus.ACTIVE) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "El usuario está inactivo."
            );
        }

        return user;
    }

    private String normalizeCode(
            String code
    ) {
        return code
                .trim()
                .toUpperCase();
    }
}