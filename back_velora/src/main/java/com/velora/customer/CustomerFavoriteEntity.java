package com.velora.customer;

import java.time.Instant;
import java.util.UUID;

import com.velora.catalog.product.ProductEntity;
import com.velora.user.UserEntity;

import jakarta.persistence.*;

@Entity
@Table(
        name = "customer_favorites",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_customer_favorites_customer_product",
                columnNames = {
                        "customer_id",
                        "product_id"
                }
        )
)
public class CustomerFavoriteEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "customer_id", nullable = false)
    private UserEntity customer;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private ProductEntity product;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public UserEntity getCustomer() {
        return customer;
    }

    public void setCustomer(UserEntity customer) {
        this.customer = customer;
    }

    public ProductEntity getProduct() {
        return product;
    }

    public void setProduct(ProductEntity product) {
        this.product = product;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}