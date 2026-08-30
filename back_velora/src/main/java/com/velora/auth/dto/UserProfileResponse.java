package com.velora.auth.dto;

import java.util.UUID;

import com.velora.user.*;

public record UserProfileResponse(
        UUID id,
        String firstName,
        String lastName,
        String email,
        UserRole role,
        CustomerType customerType,
        String phone,
        String businessName,
        String taxId,
        UserStatus status,
        UUID storeId,
        String storeName
) {

    public static UserProfileResponse from(UserEntity user) {
        return new UserProfileResponse(
                user.getId(),
                user.getFirstName(),
                user.getLastName(),
                user.getEmail(),
                user.getRole(),
                user.getCustomerType(),
                user.getPhone(),
                user.getBusinessName(),
                user.getTaxId(),
                user.getStatus(),
                user.getStore() == null ? null : user.getStore().getId(),
                user.getStore() == null ? null : user.getStore().getName()
        );
    }
}