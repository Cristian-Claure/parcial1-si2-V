package com.velora.order;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.velora.cart.CartStatus;
import com.velora.cart.ShoppingCartEntity;
import com.velora.cart.ShoppingCartItemEntity;
import com.velora.cart.ShoppingCartItemRepository;
import com.velora.cart.ShoppingCartRepository;
import com.velora.catalog.product.ProductStatus;
import com.velora.catalog.variant.ProductVariantEntity;
import com.velora.catalog.variant.ProductVariantRepository;
import com.velora.customer.CustomerAddressEntity;
import com.velora.customer.CustomerAddressRepository;
import com.velora.inventory.InventoryMovementEntity;
import com.velora.inventory.InventoryMovementRepository;
import com.velora.inventory.InventoryMovementType;
import com.velora.inventory.InventoryStockEntity;
import com.velora.inventory.InventoryStockRepository;
import com.velora.inventory.WarehouseEntity;
import com.velora.inventory.WarehouseRepository;
import com.velora.order.dto.CreateOrderRequest;
import com.velora.order.dto.OrderItemResponse;
import com.velora.order.dto.OfflineOrderItemRequest;
import com.velora.order.dto.OrderResponse;
import com.velora.order.dto.SyncOfflineOrderRequest;
import com.velora.payment.PaymentRepository;
import com.velora.payment.PaymentStatus;
import com.velora.user.UserEntity;
import com.velora.user.UserRepository;
import com.velora.user.UserRole;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class OrderService {

    private final UserRepository users;
    private final CustomerAddressRepository addresses;
    private final ProductVariantRepository variants;

    private final WarehouseRepository warehouses;
    private final InventoryStockRepository stocks;
    private final InventoryMovementRepository movements;

    private final ShoppingCartRepository carts;
    private final ShoppingCartItemRepository cartItems;

    private final OrderRepository orders;
    private final OrderItemRepository orderItems;

    private final PaymentRepository payments;

    public OrderService(
            UserRepository users,
            CustomerAddressRepository addresses,
            ProductVariantRepository variants,
            WarehouseRepository warehouses,
            InventoryStockRepository stocks,
            InventoryMovementRepository movements,
            ShoppingCartRepository carts,
            ShoppingCartItemRepository cartItems,
            OrderRepository orders,
            OrderItemRepository orderItems,
            PaymentRepository payments
    ) {
        this.users = users;
        this.addresses = addresses;
        this.variants = variants;
        this.warehouses = warehouses;
        this.stocks = stocks;
        this.movements = movements;
        this.carts = carts;
        this.cartItems = cartItems;
        this.orders = orders;
        this.orderItems = orderItems;
        this.payments = payments;
    }

    @Transactional
    public OrderResponse create(
            UUID userId,
            CreateOrderRequest request
    ) {
        UserEntity customer = requireCustomer(userId);

        ShoppingCartEntity cart = carts
                .findForUpdateByUserAndStatus(
                        userId,
                        CartStatus.ACTIVE
                )
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "No existe un carrito activo."
                ));

        List<ShoppingCartItemEntity> lines =
                new ArrayList<>(
                        cartItems.findAllForCart(cart.getId())
                );

        if (lines.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "No se puede crear un pedido con el carrito vacío."
            );
        }

        WarehouseEntity warehouse = warehouses
                .findById(request.warehouseId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Almacén no encontrado."
                ));

        if (!warehouse.isActive()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El almacén seleccionado está inactivo."
            );
        }

        CustomerAddressEntity deliveryAddress =
                resolveAddress(
                        customer,
                        request
                );

        lines.sort(
                Comparator.comparing(
                        line -> line
                                .getVariant()
                                .getId()
                                .toString()
                )
        );

        Map<UUID, InventoryStockEntity> lockedStocks =
                new LinkedHashMap<>();

        BigDecimal subtotal = BigDecimal.ZERO;
        String currency = null;

        for (ShoppingCartItemEntity line : lines) {
            ProductVariantEntity variant = line.getVariant();

            validatePurchasableVariant(variant);

            if (currency == null) {
                currency = variant.getCurrency();
            } else if (!currency.equals(variant.getCurrency())) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "El carrito contiene variantes con monedas diferentes."
                );
            }

            InventoryStockEntity stock = stocks
                    .findForUpdate(
                            warehouse.getId(),
                            variant.getId()
                    )
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.CONFLICT,
                            "La variante " + variant.getSku()
                                    + " no tiene stock en el almacén seleccionado."
                    ));

            if (stock.getAvailableQuantity() < line.getQuantity()) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Stock disponible insuficiente para "
                                + variant.getSku()
                                + ". Disponible: "
                                + stock.getAvailableQuantity()
                                + ", solicitado: "
                                + line.getQuantity()
                                + "."
                );
            }

            lockedStocks.put(
                    variant.getId(),
                    stock
            );

            subtotal = subtotal.add(
                    variant.getPrice().multiply(
                            BigDecimal.valueOf(
                                    line.getQuantity()
                            )
                    )
            );
        }

        OrderEntity order = new OrderEntity();

        order.setOrderNumber(generateOrderNumber());
        order.setOrderChannel(OrderChannel.ECOMMERCE);
        order.setCustomer(customer);
        order.setSourceCart(cart);
        order.setWarehouse(warehouse);
        order.setFulfillmentType(request.fulfillmentType());
        order.setStatus(OrderStatus.RESERVED);
        order.setCurrency(currency);
        order.setSubtotal(subtotal);
        order.setTotal(subtotal);
        order.setNotes(request.notes());

        if (deliveryAddress != null) {
            applyAddressSnapshot(
                    order,
                    deliveryAddress
            );
        }

        orders.saveAndFlush(order);

        List<OrderItemEntity> snapshots =
                new ArrayList<>();

        for (ShoppingCartItemEntity line : lines) {
            ProductVariantEntity variant = line.getVariant();

            BigDecimal lineSubtotal =
                    variant.getPrice().multiply(
                            BigDecimal.valueOf(
                                    line.getQuantity()
                            )
                    );

            OrderItemEntity orderItem =
                    new OrderItemEntity();

            orderItem.setOrder(order);
            orderItem.setVariant(variant);

            orderItem.setProductName(
                    variant.getProduct().getName()
            );

            orderItem.setSku(variant.getSku());
            orderItem.setSize(variant.getSize());
            orderItem.setColor(variant.getColor());

            orderItem.setUnitPrice(variant.getPrice());
            orderItem.setCurrency(variant.getCurrency());
            orderItem.setQuantity(line.getQuantity());
            orderItem.setSubtotal(lineSubtotal);

            snapshots.add(orderItem);

            InventoryStockEntity stock =
                    lockedStocks.get(variant.getId());

            reserveStock(
                    stock,
                    line.getQuantity(),
                    order,
                    customer
            );
        }

        orderItems.saveAll(snapshots);

        stocks.flush();
        movements.flush();
        orderItems.flush();

        cart.setStatus(CartStatus.CONVERTED);
        carts.saveAndFlush(cart);

        return response(order);
    }

    @Transactional
    public OrderResponse syncOffline(
            UUID userId,
            SyncOfflineOrderRequest request
    ) {
        UserEntity customer = requireCustomer(userId);

        OrderEntity existingOrder = orders
                .findByClientOperationId(
                        request.clientOperationId()
                )
                .orElse(null);

        if (existingOrder != null) {
            return responseForExistingOfflineOperation(
                    customer,
                    existingOrder,
                    request
            );
        }

        validateOfflineFulfillment(request);

        ShoppingCartEntity sourceCart =
                lockOfflineSourceCart(
                        customer.getId(),
                        request.sourceCartId()
                );

        WarehouseEntity warehouse = warehouses
                .findById(request.warehouseId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Almacén no encontrado."
                ));

        if (!warehouse.isActive()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El almacén seleccionado está inactivo."
            );
        }

        CustomerAddressEntity deliveryAddress =
                resolveOfflineAddress(
                        customer,
                        request
                );

        Map<UUID, Integer> quantities =
                normalizeOfflineItems(
                        request.items()
                );

        List<UUID> variantIds =
                new ArrayList<>(
                        quantities.keySet()
                );

        variantIds.sort(
                Comparator.comparing(
                        UUID::toString
                )
        );

        Map<UUID, ProductVariantEntity> orderVariants =
                new LinkedHashMap<>();

        Map<UUID, InventoryStockEntity> lockedStocks =
                new LinkedHashMap<>();

        BigDecimal subtotal = BigDecimal.ZERO;
        String currency = null;

        for (UUID variantId : variantIds) {
            ProductVariantEntity variant = variants
                    .findById(variantId)
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.CONFLICT,
                            "Una variante del pedido ya no existe."
                    ));

            validatePurchasableVariant(variant);

            int quantity =
                    quantities.get(variantId);

            if (currency == null) {
                currency = variant.getCurrency();
            } else if (!currency.equals(
                    variant.getCurrency()
            )) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "El pedido contiene variantes con monedas diferentes."
                );
            }

            InventoryStockEntity stock = stocks
                    .findForUpdate(
                            warehouse.getId(),
                            variant.getId()
                    )
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.CONFLICT,
                            "La variante "
                                    + variant.getSku()
                                    + " no tiene stock en la sucursal seleccionada."
                    ));

            if (stock.getAvailableQuantity() < quantity) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Stock disponible insuficiente para "
                                + variant.getSku()
                                + ". Disponible: "
                                + stock.getAvailableQuantity()
                                + ", solicitado: "
                                + quantity
                                + "."
                );
            }

            orderVariants.put(
                    variant.getId(),
                    variant
            );

            lockedStocks.put(
                    variant.getId(),
                    stock
            );

            subtotal = subtotal.add(
                    variant.getPrice().multiply(
                            BigDecimal.valueOf(quantity)
                    )
            );
        }

        OrderEntity order = new OrderEntity();

        order.setOrderNumber(generateOrderNumber());
        order.setOrderChannel(OrderChannel.ECOMMERCE);

        order.setClientOperationId(
                request.clientOperationId()
        );

        order.setClientCreatedAt(
                request.clientCreatedAt()
        );

        order.setSyncedAt(Instant.now());

        order.setCustomer(customer);
        order.setWarehouse(warehouse);

        order.setFulfillmentType(
                request.fulfillmentType()
        );

        order.setStatus(OrderStatus.RESERVED);
        order.setCurrency(currency);
        order.setSubtotal(subtotal);
        order.setTotal(subtotal);
        order.setNotes(request.notes());

        if (deliveryAddress != null) {
            applyAddressSnapshot(
                    order,
                    deliveryAddress
            );
        }

        orders.saveAndFlush(order);

        List<OrderItemEntity> snapshots =
                new ArrayList<>();

        for (UUID variantId : variantIds) {
            ProductVariantEntity variant =
                    orderVariants.get(variantId);

            int quantity =
                    quantities.get(variantId);

            BigDecimal lineSubtotal =
                    variant.getPrice().multiply(
                            BigDecimal.valueOf(quantity)
                    );

            OrderItemEntity orderItem =
                    new OrderItemEntity();

            orderItem.setOrder(order);
            orderItem.setVariant(variant);

            orderItem.setProductName(
                    variant.getProduct().getName()
            );

            orderItem.setSku(variant.getSku());
            orderItem.setSize(variant.getSize());
            orderItem.setColor(variant.getColor());

            orderItem.setUnitPrice(
                    variant.getPrice()
            );

            orderItem.setCurrency(
                    variant.getCurrency()
            );

            orderItem.setQuantity(quantity);
            orderItem.setSubtotal(lineSubtotal);

            snapshots.add(orderItem);

            reserveStock(
                    lockedStocks.get(variantId),
                    quantity,
                    order,
                    customer
            );
        }

        orderItems.saveAll(snapshots);

        stocks.flush();
        movements.flush();
        orderItems.flush();

        reconcileOfflineSourceCart(
                sourceCart,
                quantities
        );

        return response(order);
    }

    @Transactional(readOnly = true)
    public List<OrderResponse> list(UUID userId) {
        requireCustomer(userId);

        return orders
                .findAllByCustomerIdOrderByCreatedAtDesc(userId)
                .stream()
                .map(this::response)
                .toList();
    }

    @Transactional(readOnly = true)
    public OrderResponse get(
            UUID userId,
            UUID orderId
    ) {
        requireCustomer(userId);

        OrderEntity order = orders
                .findByIdAndCustomerId(
                        orderId,
                        userId
                )
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Pedido no encontrado."
                ));

        return response(order);
    }

    @Transactional
    public OrderResponse cancel(
            UUID userId,
            UUID orderId
    ) {
        UserEntity customer = requireCustomer(userId);

        OrderEntity order = orders
                .findForUpdateByIdAndCustomer(
                        orderId,
                        userId
                )
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Pedido no encontrado."
                ));

        if (order.getStatus() != OrderStatus.RESERVED) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Solo pueden cancelarse pedidos reservados."
            );
        }

        if (payments.existsByOrderIdAndStatus(
                order.getId(),
                PaymentStatus.PAID
        )) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El pedido tiene un pago confirmado. Debe reembolsarse antes de cancelar el pedido."
            );
        }

        if (payments.existsByOrderIdAndStatus(
                order.getId(),
                PaymentStatus.PENDING
        )) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El pedido tiene un pago pendiente. Debe cancelarse el pago antes de cancelar el pedido."
            );
        }

        List<OrderItemEntity> lines =
                new ArrayList<>(
                        orderItems
                                .findAllByOrderIdOrderByProductNameAscSkuAsc(
                                        order.getId()
                                )
                );

        lines.sort(
                Comparator.comparing(
                        line -> line
                                .getVariant()
                                .getId()
                                .toString()
                )
        );

        Map<UUID, InventoryStockEntity> lockedStocks =
                new LinkedHashMap<>();

        for (OrderItemEntity line : lines) {
            InventoryStockEntity stock = stocks
                    .findForUpdate(
                            order.getWarehouse().getId(),
                            line.getVariant().getId()
                    )
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.CONFLICT,
                            "No existe el stock asociado a la reserva del pedido."
                    ));

            if (stock.getCommittedQuantity() < line.getQuantity()) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "La reserva de inventario del pedido es inconsistente."
                );
            }

            lockedStocks.put(
                    line.getVariant().getId(),
                    stock
            );
        }

        for (OrderItemEntity line : lines) {
            InventoryStockEntity stock =
                    lockedStocks.get(
                            line.getVariant().getId()
                    );

            releaseStock(
                    stock,
                    line.getQuantity(),
                    order,
                    customer
            );
        }

        stocks.flush();
        movements.flush();

        order.setStatus(OrderStatus.CANCELLED);
        order.setCancelledAt(Instant.now());

        orders.saveAndFlush(order);

        return response(order);
    }

    @Transactional
    public OrderResponse fulfill(
            UUID actorId,
            UUID orderId
    ) {
        UserEntity actor = requireOperationalActor(actorId);

        OrderEntity order = orders
                .findById(orderId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Pedido no encontrado."
                ));

        validateOrderStoreAccess(
                actor,
                order
        );

        OrderEntity lockedOrder = orders
                .findForUpdateById(orderId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Pedido no encontrado."
                ));

        if (lockedOrder.getStatus() != OrderStatus.RESERVED) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Solo pueden entregarse pedidos reservados."
            );
        }

        if (!payments.existsByOrderIdAndStatus(
                lockedOrder.getId(),
                PaymentStatus.PAID
        )) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El pedido debe tener un pago confirmado antes de ser entregado."
            );
        }

        List<OrderItemEntity> lines =
                new ArrayList<>(
                        orderItems
                                .findAllByOrderIdOrderByProductNameAscSkuAsc(
                                        lockedOrder.getId()
                                )
                );

        lines.sort(
                Comparator.comparing(
                        line -> line
                                .getVariant()
                                .getId()
                                .toString()
                )
        );

        Map<UUID, InventoryStockEntity> lockedStocks =
                new LinkedHashMap<>();

        for (OrderItemEntity line : lines) {
            InventoryStockEntity stock = stocks
                    .findForUpdate(
                            lockedOrder.getWarehouse().getId(),
                            line.getVariant().getId()
                    )
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.CONFLICT,
                            "No existe el stock asociado al pedido."
                    ));

            if (stock.getCommittedQuantity() < line.getQuantity()) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "El stock comprometido del pedido es inconsistente."
                );
            }

            if (stock.getPhysicalQuantity() < line.getQuantity()) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "El stock físico del pedido es inconsistente."
                );
            }

            lockedStocks.put(
                    line.getVariant().getId(),
                    stock
            );
        }

        for (OrderItemEntity line : lines) {
            InventoryStockEntity stock =
                    lockedStocks.get(
                            line.getVariant().getId()
                    );

            fulfillStock(
                    stock,
                    line.getQuantity(),
                    lockedOrder,
                    actor
            );
        }

        stocks.flush();
        movements.flush();

        lockedOrder.setStatus(
                OrderStatus.FULFILLED
        );

        lockedOrder.setFulfilledAt(
                Instant.now()
        );

        orders.saveAndFlush(
                lockedOrder
        );

        return response(
                lockedOrder
        );
    }

    private void fulfillStock(
            InventoryStockEntity stock,
            int quantity,
            OrderEntity order,
            UserEntity actor
    ) {
        int physicalBefore =
                stock.getPhysicalQuantity();

        int committedBefore =
                stock.getCommittedQuantity();

        int physicalAfter =
                physicalBefore - quantity;

        int committedAfter =
                committedBefore - quantity;

        if (physicalAfter < 0
                || committedAfter < 0
                || committedAfter > physicalAfter) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El inventario no permite completar la venta."
            );
        }

        stock.setPhysicalQuantity(
                physicalAfter
        );

        stock.setCommittedQuantity(
                committedAfter
        );

        stocks.save(stock);

        InventoryMovementEntity movement =
                new InventoryMovementEntity();

        movement.setWarehouse(
                stock.getWarehouse()
        );

        movement.setVariant(
                stock.getVariant()
        );

        movement.setMovementType(
                InventoryMovementType.SALE
        );

        movement.setQuantity(quantity);

        movement.setPhysicalDelta(
                -quantity
        );

        movement.setCommittedDelta(
                -quantity
        );

        movement.setPhysicalBefore(
                physicalBefore
        );

        movement.setPhysicalAfter(
                physicalAfter
        );

        movement.setCommittedBefore(
                committedBefore
        );

        movement.setCommittedAfter(
                committedAfter
        );

        movement.setReferenceType("ORDER");
        movement.setReferenceId(
                order.getId()
        );

        movement.setReason(
                "Venta por cumplimiento del pedido "
                        + order.getOrderNumber()
        );

        movement.setPerformedBy(actor);

        movements.save(movement);
    }

    private UserEntity requireOperationalActor(
            UUID actorId
    ) {
        UserEntity actor = users
                .findById(actorId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED,
                        "Usuario autenticado no encontrado."
                ));

        if (actor.getRole() != UserRole.ADMIN
                && actor.getRole() != UserRole.STORE_MANAGER) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "No tiene permisos para completar pedidos."
            );
        }

        return actor;
    }

    private void validateOrderStoreAccess(
            UserEntity actor,
            OrderEntity order
    ) {
        if (actor.getRole() == UserRole.ADMIN) {
            return;
        }

        if (actor.getStore() == null) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "El encargado no tiene una sucursal asignada."
            );
        }

        if (!actor.getStore().getId().equals(
                order.getWarehouse()
                        .getStore()
                        .getId()
        )) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "No puede completar pedidos de otra sucursal."
            );
        }
    }

    private void validateOfflineFulfillment(
            SyncOfflineOrderRequest request
    ) {
        if (request.fulfillmentType() != FulfillmentType.DELIVERY
                && request.fulfillmentType() != FulfillmentType.PICKUP) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "El pedido offline solo admite entrega a domicilio o recojo en tienda."
            );
        }
    }

    private CustomerAddressEntity resolveOfflineAddress(
            UserEntity customer,
            SyncOfflineOrderRequest request
    ) {
        if (request.fulfillmentType() == FulfillmentType.PICKUP) {
            if (request.addressId() != null) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Los pedidos para recojo en tienda no deben incluir dirección de entrega."
                );
            }

            return null;
        }

        if (request.addressId() == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "La dirección de entrega es obligatoria."
            );
        }

        return addresses
                .findByIdAndUserIdAndActiveTrue(
                        request.addressId(),
                        customer.getId()
                )
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "La dirección seleccionada ya no está disponible."
                ));
    }

    private Map<UUID, Integer> normalizeOfflineItems(
            List<OfflineOrderItemRequest> requestedItems
    ) {
        if (requestedItems == null
                || requestedItems.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "El pedido offline no contiene productos."
            );
        }

        Map<UUID, Integer> quantities =
                new LinkedHashMap<>();

        for (OfflineOrderItemRequest item : requestedItems) {
            if (item == null
                    || item.variantId() == null
                    || item.quantity() <= 0) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "El pedido offline contiene un producto inválido."
                );
            }

            quantities.merge(
                    item.variantId(),
                    item.quantity(),
                    Integer::sum
            );
        }

        return quantities;
    }

    private OrderResponse responseForExistingOfflineOperation(
            UserEntity customer,
            OrderEntity existingOrder,
            SyncOfflineOrderRequest request
    ) {
        if (existingOrder.getOrderChannel()
                    != OrderChannel.ECOMMERCE
                || existingOrder.getCustomer() == null
                || !existingOrder
                        .getCustomer()
                        .getId()
                        .equals(customer.getId())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El identificador de operación ya fue utilizado."
            );
        }

        UUID existingAddressId =
                existingOrder.getAddress() == null
                        ? null
                        : existingOrder
                                .getAddress()
                                .getId();

        boolean sameHeader =
                existingOrder
                        .getWarehouse()
                        .getId()
                        .equals(request.warehouseId())
                && existingOrder.getFulfillmentType()
                        == request.fulfillmentType()
                && java.util.Objects.equals(
                        existingAddressId,
                        request.addressId()
                )
                && java.util.Objects.equals(
                        existingOrder.getClientCreatedAt(),
                        request.clientCreatedAt()
                )
                && java.util.Objects.equals(
                        normalizeOfflineNotes(
                                existingOrder.getNotes()
                        ),
                        normalizeOfflineNotes(
                                request.notes()
                        )
                );

        if (!sameHeader) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El identificador de operación ya pertenece a otro pedido."
            );
        }

        Map<UUID, Integer> requestedQuantities =
                normalizeOfflineItems(
                        request.items()
                );

        Map<UUID, Integer> storedQuantities =
                new LinkedHashMap<>();

        for (OrderItemEntity line :
                orderItems
                        .findAllByOrderIdOrderByProductNameAscSkuAsc(
                                existingOrder.getId()
                        )) {

            storedQuantities.merge(
                    line.getVariant().getId(),
                    line.getQuantity(),
                    Integer::sum
            );
        }

        if (!storedQuantities.equals(
                requestedQuantities
        )) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El identificador de operación ya pertenece a otro pedido."
            );
        }

        return response(existingOrder);
    }

    private String normalizeOfflineNotes(
            String notes
    ) {
        return notes == null || notes.isBlank()
                ? null
                : notes.trim();
    }
    private CustomerAddressEntity resolveAddress(
            UserEntity customer,
            CreateOrderRequest request
    ) {
        if (request.fulfillmentType() == FulfillmentType.PICKUP) {
            if (request.addressId() != null) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Los pedidos para recojo en tienda no deben incluir dirección de entrega."
                );
            }

            return null;
        }

        if (request.addressId() == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "La dirección de entrega es obligatoria."
            );
        }

        return addresses
                .findByIdAndUserIdAndActiveTrue(
                        request.addressId(),
                        customer.getId()
                )
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Dirección de entrega no encontrada."
                ));
    }

    private void applyAddressSnapshot(
            OrderEntity order,
            CustomerAddressEntity address
    ) {
        order.setAddress(address);
        order.setRecipientName(address.getRecipientName());
        order.setRecipientPhone(address.getRecipientPhone());
        order.setDepartment(address.getDepartment());
        order.setCity(address.getCity());
        order.setZone(address.getZone());
        order.setAddressLine(address.getAddressLine());
        order.setAddressReference(address.getReference());
    }

    private void reserveStock(
            InventoryStockEntity stock,
            int quantity,
            OrderEntity order,
            UserEntity customer
    ) {
        int physicalBefore =
                stock.getPhysicalQuantity();

        int committedBefore =
                stock.getCommittedQuantity();

        int committedAfter =
                committedBefore + quantity;

        stock.setCommittedQuantity(
                committedAfter
        );

        stocks.save(stock);

        InventoryMovementEntity movement =
                new InventoryMovementEntity();

        movement.setWarehouse(
                stock.getWarehouse()
        );

        movement.setVariant(
                stock.getVariant()
        );

        movement.setMovementType(
                InventoryMovementType.RESERVE
        );

        movement.setQuantity(quantity);

        movement.setPhysicalDelta(0);
        movement.setCommittedDelta(quantity);

        movement.setPhysicalBefore(
                physicalBefore
        );

        movement.setPhysicalAfter(
                physicalBefore
        );

        movement.setCommittedBefore(
                committedBefore
        );

        movement.setCommittedAfter(
                committedAfter
        );

        movement.setReferenceType("ORDER");
        movement.setReferenceId(order.getId());

        movement.setReason(
                "Reserva por pedido "
                        + order.getOrderNumber()
        );

        movement.setPerformedBy(customer);

        movements.save(movement);
    }

    private void releaseStock(
            InventoryStockEntity stock,
            int quantity,
            OrderEntity order,
            UserEntity customer
    ) {
        int physicalBefore =
                stock.getPhysicalQuantity();

        int committedBefore =
                stock.getCommittedQuantity();

        int committedAfter =
                committedBefore - quantity;

        stock.setCommittedQuantity(
                committedAfter
        );

        stocks.save(stock);

        InventoryMovementEntity movement =
                new InventoryMovementEntity();

        movement.setWarehouse(
                stock.getWarehouse()
        );

        movement.setVariant(
                stock.getVariant()
        );

        movement.setMovementType(
                InventoryMovementType.RELEASE
        );

        movement.setQuantity(quantity);

        movement.setPhysicalDelta(0);
        movement.setCommittedDelta(-quantity);

        movement.setPhysicalBefore(
                physicalBefore
        );

        movement.setPhysicalAfter(
                physicalBefore
        );

        movement.setCommittedBefore(
                committedBefore
        );

        movement.setCommittedAfter(
                committedAfter
        );

        movement.setReferenceType("ORDER");
        movement.setReferenceId(order.getId());

        movement.setReason(
                "Liberación por cancelación del pedido "
                        + order.getOrderNumber()
        );

        movement.setPerformedBy(customer);

        movements.save(movement);
    }

    private void validatePurchasableVariant(
            ProductVariantEntity variant
    ) {
        if (!variant.isActive()
                || variant.getProduct().getStatus()
                    != ProductStatus.ACTIVE) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Una variante del carrito ya no está disponible para la venta."
            );
        }
    }

    private ShoppingCartEntity lockOfflineSourceCart(
            UUID userId,
            UUID sourceCartId
    ) {
        if (sourceCartId == null) {
            return null;
        }

        return carts
                .findForUpdateByIdAndUserAndStatus(
                        sourceCartId,
                        userId,
                        CartStatus.ACTIVE
                )
                .orElse(null);
    }

    private void reconcileOfflineSourceCart(
            ShoppingCartEntity sourceCart,
            Map<UUID, Integer> orderedQuantities
    ) {
        if (sourceCart == null) {
            return;
        }

        for (
                Map.Entry<UUID, Integer> entry
                        : orderedQuantities.entrySet()
        ) {
            ShoppingCartItemEntity cartItem =
                    cartItems
                            .findByCartIdAndVariantId(
                                    sourceCart.getId(),
                                    entry.getKey()
                            )
                            .orElse(null);

            if (cartItem == null) {
                continue;
            }

            int remainingQuantity =
                    cartItem.getQuantity()
                            - entry.getValue();

            if (remainingQuantity > 0) {
                cartItem.setQuantity(
                        remainingQuantity
                );

                cartItems.save(
                        cartItem
                );
            } else {
                cartItems.delete(
                        cartItem
                );
            }
        }

        cartItems.flush();
    }
    private UserEntity requireCustomer(UUID userId) {
        UserEntity user = users
                .findById(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED,
                        "Usuario autenticado no encontrado."
                ));

        if (user.getRole() != UserRole.CUSTOMER) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "La operación está disponible únicamente para clientes."
            );
        }

        return user;
    }

    private String generateOrderNumber() {
        String date = LocalDate
                .now(ZoneOffset.UTC)
                .format(
                        DateTimeFormatter.BASIC_ISO_DATE
                );

        String random = UUID
                .randomUUID()
                .toString()
                .replace("-", "")
                .substring(0, 12)
                .toUpperCase();

        return "VEL-" + date + "-" + random;
    }

    private OrderResponse response(
            OrderEntity order
    ) {
        List<OrderItemResponse> items =
                orderItems
                        .findAllByOrderIdOrderByProductNameAscSkuAsc(
                                order.getId()
                        )
                        .stream()
                        .map(OrderItemResponse::from)
                        .toList();

        WarehouseEntity warehouse =
                order.getWarehouse();

        return new OrderResponse(
                order.getId(),
                order.getOrderNumber(),

                warehouse.getId(),
                warehouse.getStore().getId(),
                warehouse.getStore().getName(),

                order.getFulfillmentType(),
                order.getStatus(),

                order.getCurrency(),
                order.getSubtotal(),
                order.getTotal(),

                order.getRecipientName(),
                order.getRecipientPhone(),

                order.getDepartment(),
                order.getCity(),
                order.getZone(),
                order.getAddressLine(),
                order.getAddressReference(),

                order.getNotes(),

                order.getCreatedAt(),
                order.getCancelledAt(),
                order.getFulfilledAt(),

                items
        );
    }
}
