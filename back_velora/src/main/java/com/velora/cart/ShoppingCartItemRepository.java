package com.velora.cart;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ShoppingCartItemRepository
        extends JpaRepository<ShoppingCartItemEntity, UUID> {

    Optional<ShoppingCartItemEntity> findByCartIdAndVariantId(
            UUID cartId,
            UUID variantId
    );

    @Query("""
        select i
        from ShoppingCartItemEntity i
        join fetch i.variant v
        join fetch v.product p
        where i.cart.id = :cartId
        order by p.name, v.color, v.size
    """)
    List<ShoppingCartItemEntity> findAllForCart(
            @Param("cartId") UUID cartId
    );

    @Query("""
        select i
        from ShoppingCartItemEntity i
        join fetch i.cart c
        join fetch i.variant v
        join fetch v.product p
        where i.id = :itemId
          and c.user.id = :userId
          and c.status = com.velora.cart.CartStatus.ACTIVE
    """)
    Optional<ShoppingCartItemEntity> findActiveItemForCustomer(
            @Param("itemId") UUID itemId,
            @Param("userId") UUID userId
    );

    void deleteAllByCartId(UUID cartId);
}