package com.velora.order;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import com.velora.cart.ShoppingCartEntity;
import com.velora.customer.CustomerAddressEntity;
import com.velora.inventory.WarehouseEntity;
import com.velora.pos.CashSessionEntity;
import com.velora.pos.PointOfSaleEntity;
import com.velora.user.UserEntity;

import jakarta.persistence.*;

@Entity
@Table(name = "orders")
public class OrderEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "order_number", nullable = false, unique = true, length = 40)
    private String orderNumber;

    @Enumerated(EnumType.STRING)
    @Column(name = "order_channel", nullable = false, length = 20)
    private OrderChannel orderChannel;

    @Column(name = "client_operation_id")
    private UUID clientOperationId;

    @Column(name = "client_created_at")
    private Instant clientCreatedAt;

    @Column(name = "synced_at")
    private Instant syncedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "customer_id")
    private UserEntity customer;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "source_cart_id", unique = true)
    private ShoppingCartEntity sourceCart;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "point_of_sale_id")
    private PointOfSaleEntity pointOfSale;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cash_session_id")
    private CashSessionEntity cashSession;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "warehouse_id", nullable = false)
    private WarehouseEntity warehouse;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "address_id")
    private CustomerAddressEntity address;

    @Enumerated(EnumType.STRING)
    @Column(name = "fulfillment_type", nullable = false, length = 20)
    private FulfillmentType fulfillmentType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private OrderStatus status;

    @Column(nullable = false, length = 3)
    private String currency;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal subtotal;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal total;

    @Column(name = "recipient_name", length = 180)
    private String recipientName;

    @Column(name = "recipient_phone", length = 40)
    private String recipientPhone;

    @Column(length = 100)
    private String department;

    @Column(length = 100)
    private String city;

    @Column(length = 120)
    private String zone;

    @Column(name = "address_line", length = 240)
    private String addressLine;

    @Column(name = "address_reference", length = 300)
    private String addressReference;

    @Column(length = 500)
    private String notes;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Column(name = "fulfilled_at")
    private Instant fulfilledAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
        normalize();
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
        normalize();
    }

    private void normalize() {
        orderNumber = orderNumber == null
                ? null
                : orderNumber.trim().toUpperCase();

        currency = currency == null
                ? null
                : currency.trim().toUpperCase();

        notes = notes == null || notes.isBlank()
                ? null
                : notes.trim();
    }

    public UUID getId() { return id; }

    public String getOrderNumber() { return orderNumber; }
    public void setOrderNumber(String orderNumber) { this.orderNumber = orderNumber; }

    public OrderChannel getOrderChannel() { return orderChannel; }
    public void setOrderChannel(OrderChannel orderChannel) {
        this.orderChannel = orderChannel;
    }

    public UUID getClientOperationId() { return clientOperationId; }
    public void setClientOperationId(UUID clientOperationId) {
        this.clientOperationId = clientOperationId;
    }

    public Instant getClientCreatedAt() { return clientCreatedAt; }
    public void setClientCreatedAt(Instant clientCreatedAt) {
        this.clientCreatedAt = clientCreatedAt;
    }

    public Instant getSyncedAt() { return syncedAt; }
    public void setSyncedAt(Instant syncedAt) {
        this.syncedAt = syncedAt;
    }

    public PointOfSaleEntity getPointOfSale() { return pointOfSale; }
    public void setPointOfSale(PointOfSaleEntity pointOfSale) {
        this.pointOfSale = pointOfSale;
    }

    public CashSessionEntity getCashSession() { return cashSession; }
    public void setCashSession(CashSessionEntity cashSession) {
        this.cashSession = cashSession;
    }

    public UserEntity getCustomer() { return customer; }
    public void setCustomer(UserEntity customer) { this.customer = customer; }

    public ShoppingCartEntity getSourceCart() { return sourceCart; }
    public void setSourceCart(ShoppingCartEntity sourceCart) { this.sourceCart = sourceCart; }

    public WarehouseEntity getWarehouse() { return warehouse; }
    public void setWarehouse(WarehouseEntity warehouse) { this.warehouse = warehouse; }

    public CustomerAddressEntity getAddress() { return address; }
    public void setAddress(CustomerAddressEntity address) { this.address = address; }

    public FulfillmentType getFulfillmentType() { return fulfillmentType; }
    public void setFulfillmentType(FulfillmentType fulfillmentType) {
        this.fulfillmentType = fulfillmentType;
    }

    public OrderStatus getStatus() { return status; }
    public void setStatus(OrderStatus status) { this.status = status; }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public BigDecimal getSubtotal() { return subtotal; }
    public void setSubtotal(BigDecimal subtotal) { this.subtotal = subtotal; }

    public BigDecimal getTotal() { return total; }
    public void setTotal(BigDecimal total) { this.total = total; }

    public String getRecipientName() { return recipientName; }
    public void setRecipientName(String recipientName) { this.recipientName = recipientName; }

    public String getRecipientPhone() { return recipientPhone; }
    public void setRecipientPhone(String recipientPhone) { this.recipientPhone = recipientPhone; }

    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }

    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }

    public String getZone() { return zone; }
    public void setZone(String zone) { this.zone = zone; }

    public String getAddressLine() { return addressLine; }
    public void setAddressLine(String addressLine) { this.addressLine = addressLine; }

    public String getAddressReference() { return addressReference; }
    public void setAddressReference(String addressReference) {
        this.addressReference = addressReference;
    }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public Instant getCancelledAt() { return cancelledAt; }
    public void setCancelledAt(Instant cancelledAt) { this.cancelledAt = cancelledAt; }

    public Instant getFulfilledAt() { return fulfilledAt; }
    public void setFulfilledAt(Instant fulfilledAt) { this.fulfilledAt = fulfilledAt; }

    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}