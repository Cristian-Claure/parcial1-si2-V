package com.velora.order.checkout;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.velora.cart.CartStatus;
import com.velora.cart.ShoppingCartEntity;
import com.velora.cart.ShoppingCartItemEntity;
import com.velora.cart.ShoppingCartItemRepository;
import com.velora.cart.ShoppingCartRepository;
import com.velora.inventory.InventoryStockEntity;
import com.velora.inventory.InventoryStockRepository;
import com.velora.inventory.WarehouseEntity;
import com.velora.inventory.WarehouseRepository;
import com.velora.user.UserEntity;
import com.velora.user.UserRepository;
import com.velora.user.UserRole;
import com.velora.user.UserStatus;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CheckoutService {

    private final UserRepository users;
    private final ShoppingCartRepository carts;
    private final ShoppingCartItemRepository cartItems;
    private final WarehouseRepository warehouses;
    private final InventoryStockRepository stocks;

    public CheckoutService(
            UserRepository users,
            ShoppingCartRepository carts,
            ShoppingCartItemRepository cartItems,
            WarehouseRepository warehouses,
            InventoryStockRepository stocks
    ) {
        this.users = users;
        this.carts = carts;
        this.cartItems = cartItems;
        this.warehouses = warehouses;
        this.stocks = stocks;
    }

    @Transactional(readOnly = true)
    public List<CheckoutWarehouseResponse> eligibleWarehouses(
            UUID userId
    ) {
        requireCustomer(userId);

        ShoppingCartEntity cart = carts
                .findByUserIdAndStatus(
                        userId,
                        CartStatus.ACTIVE
                )
                .orElse(null);

        if (cart == null) {
            return List.of();
        }

        List<ShoppingCartItemEntity> lines =
                cartItems.findAllForCart(
                        cart.getId()
                );

        if (lines.isEmpty()) {
            return List.of();
        }

        return warehouses
                .findAllByOrderByNameAsc()
                .stream()
                .filter(WarehouseEntity::isActive)
                .filter(
                        warehouse ->
                                warehouse.getStore()
                                        .isActive()
                )
                .filter(
                        warehouse ->
                                canFulfill(
                                        warehouse,
                                        lines
                                )
                )
                .map(
                        warehouse ->
                                new CheckoutWarehouseResponse(
                                        warehouse.getId(),
                                        warehouse.getCode(),
                                        warehouse.getName(),
                                        warehouse.getStore().getId(),
                                        warehouse.getStore().getName(),
                                        warehouse.getStore().getAddress()
                                )
                )
                .sorted(
                        Comparator
                                .comparing(
                                        CheckoutWarehouseResponse::storeName,
                                        String.CASE_INSENSITIVE_ORDER
                                )
                                .thenComparing(
                                        CheckoutWarehouseResponse::warehouseName,
                                        String.CASE_INSENSITIVE_ORDER
                                )
                )
                .toList();
    }

    private boolean canFulfill(
            WarehouseEntity warehouse,
            List<ShoppingCartItemEntity> lines
    ) {
        Map<UUID, InventoryStockEntity> stockByVariant =
                stocks.findAllForWarehouse(
                                warehouse.getId()
                        )
                        .stream()
                        .collect(
                                Collectors.toMap(
                                        stock ->
                                                stock.getVariant()
                                                        .getId(),
                                        Function.identity()
                                )
                        );

        return lines.stream().allMatch(
                line -> {
                    InventoryStockEntity stock =
                            stockByVariant.get(
                                    line.getVariant()
                                            .getId()
                            );

                    return stock != null &&
                            stock.getAvailableQuantity()
                                    >= line.getQuantity();
                }
        );
    }

    private UserEntity requireCustomer(
            UUID userId
    ) {
        UserEntity user = users
                .findById(userId)
                .orElseThrow(
                        () ->
                                new ResponseStatusException(
                                        HttpStatus.UNAUTHORIZED,
                                        "Usuario autenticado no encontrado."
                                )
                );

        if (
                user.getRole() !=
                        UserRole.CUSTOMER
        ) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "La operación está disponible únicamente para clientes."
            );
        }

        if (
                user.getStatus() !=
                        UserStatus.ACTIVE
        ) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "La cuenta del cliente no está activa."
            );
        }

        return user;
    }
}