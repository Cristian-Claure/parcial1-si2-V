package com.velora.customer.dto;

import java.util.UUID;

import com.velora.customer.CustomerAddressEntity;

public record CustomerAddressResponse(
        UUID id,
        String label,
        String recipientName,
        String recipientPhone,
        String department,
        String city,
        String zone,
        String addressLine,
        String reference,
        boolean defaultAddress
) {

    public static CustomerAddressResponse from(CustomerAddressEntity address) {
        return new CustomerAddressResponse(
                address.getId(),
                address.getLabel(),
                address.getRecipientName(),
                address.getRecipientPhone(),
                address.getDepartment(),
                address.getCity(),
                address.getZone(),
                address.getAddressLine(),
                address.getReference(),
                address.isDefaultAddress()
        );
    }
}