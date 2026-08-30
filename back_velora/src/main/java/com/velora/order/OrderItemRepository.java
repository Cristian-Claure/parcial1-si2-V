package com.velora.order;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderItemRepository
        extends JpaRepository<OrderItemEntity, UUID> {

    List<OrderItemEntity>
        findAllByOrderIdOrderByProductNameAscSkuAsc(UUID orderId);
}