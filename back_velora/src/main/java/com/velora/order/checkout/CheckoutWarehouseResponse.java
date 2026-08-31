package com.velora.order.checkout;

import java.util.UUID;

public record CheckoutWarehouseResponse(
        UUID warehouseId,
        String warehouseCode,
        String warehouseName,
        UUID storeId,
        String storeName,
        String storeAddress
) {}