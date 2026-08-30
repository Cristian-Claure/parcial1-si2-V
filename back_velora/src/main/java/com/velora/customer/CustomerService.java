package com.velora.customer;

import java.util.List;
import java.util.UUID;

import com.velora.auth.dto.UserProfileResponse;
import com.velora.customer.dto.*;
import com.velora.user.*;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CustomerService {

    private final UserRepository users;
    private final CustomerAddressRepository addresses;

    public CustomerService(
            UserRepository users,
            CustomerAddressRepository addresses
    ) {
        this.users = users;
        this.addresses = addresses;
    }

    @Transactional(readOnly = true)
    public UserProfileResponse profile(UUID userId) {
        return UserProfileResponse.from(requireCustomer(userId));
    }

    @Transactional
    public UserProfileResponse updateProfile(
            UUID userId,
            CustomerProfileUpdateRequest request
    ) {
        UserEntity user = requireCustomer(userId);

        if (
            request.customerType() == CustomerType.B2B &&
            (
                isBlank(request.businessName()) ||
                isBlank(request.taxId())
            )
        ) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Los clientes B2B deben registrar razón social y NIT."
            );
        }

        user.setFirstName(request.firstName());
        user.setLastName(request.lastName());
        user.setPhone(request.phone());
        user.setCustomerType(request.customerType());

        if (request.customerType() == CustomerType.B2B) {
            user.setBusinessName(request.businessName());
            user.setTaxId(request.taxId());
        } else {
            user.setBusinessName(null);
            user.setTaxId(null);
        }

        return UserProfileResponse.from(users.save(user));
    }

    @Transactional(readOnly = true)
    public List<CustomerAddressResponse> listAddresses(UUID userId) {
        requireCustomer(userId);

        return addresses
                .findAllByUserIdAndActiveTrueOrderByDefaultAddressDescCreatedAtAsc(userId)
                .stream()
                .map(CustomerAddressResponse::from)
                .toList();
    }

    @Transactional
    public CustomerAddressResponse createAddress(
            UUID userId,
            CustomerAddressRequest request
    ) {
        UserEntity user = requireCustomer(userId);

        List<CustomerAddressEntity> existing =
                addresses.findAllByUserIdAndActiveTrueOrderByDefaultAddressDescCreatedAtAsc(userId);

        boolean shouldBeDefault =
                existing.isEmpty() || request.defaultAddress();

        if (shouldBeDefault) {
            clearDefault(existing);

            // La restricción de PostgreSQL permite una sola dirección
            // predeterminada activa por cliente. Forzamos primero el UPDATE
            // de la dirección anterior antes de insertar la nueva.
            addresses.flush();
        }

        CustomerAddressEntity address = new CustomerAddressEntity();
        address.setUser(user);
        apply(address, request);
        address.setDefaultAddress(shouldBeDefault);
        address.setActive(true);

        return CustomerAddressResponse.from(addresses.save(address));
    }

    @Transactional
    public CustomerAddressResponse updateAddress(
            UUID userId,
            UUID addressId,
            CustomerAddressRequest request
    ) {
        requireCustomer(userId);

        CustomerAddressEntity address =
                requireAddress(userId, addressId);

        if (request.defaultAddress()) {
            List<CustomerAddressEntity> existing =
                    addresses.findAllByUserIdAndActiveTrueOrderByDefaultAddressDescCreatedAtAsc(userId);

            clearDefault(existing);

            // Evita violar temporalmente el índice único al cambiar
            // cuál es la dirección predeterminada.
            addresses.flush();

            address.setDefaultAddress(true);
        }

        apply(address, request);

        return CustomerAddressResponse.from(addresses.save(address));
    }

    @Transactional
    public void deleteAddress(
            UUID userId,
            UUID addressId
    ) {
        requireCustomer(userId);

        CustomerAddressEntity address =
                requireAddress(userId, addressId);

        boolean wasDefault = address.isDefaultAddress();

        address.setDefaultAddress(false);
        address.setActive(false);
        addresses.save(address);

        if (wasDefault) {
            List<CustomerAddressEntity> remaining =
                    addresses.findAllByUserIdAndActiveTrueOrderByDefaultAddressDescCreatedAtAsc(userId);

            if (!remaining.isEmpty()) {
                CustomerAddressEntity nextDefault = remaining.getFirst();
                nextDefault.setDefaultAddress(true);
                addresses.save(nextDefault);
            }
        }
    }

    private UserEntity requireCustomer(UUID userId) {
        UserEntity user = users.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Cliente no encontrado."
                ));

        if (user.getRole() != UserRole.CUSTOMER) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "La operación está disponible únicamente para clientes."
            );
        }

        return user;
    }

    private CustomerAddressEntity requireAddress(
            UUID userId,
            UUID addressId
    ) {
        return addresses
                .findByIdAndUserIdAndActiveTrue(addressId, userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Dirección no encontrada."
                ));
    }

    private void clearDefault(
            List<CustomerAddressEntity> existing
    ) {
        for (CustomerAddressEntity address : existing) {
            if (address.isDefaultAddress()) {
                address.setDefaultAddress(false);
            }
        }
    }

    private void apply(
            CustomerAddressEntity address,
            CustomerAddressRequest request
    ) {
        address.setLabel(request.label());
        address.setRecipientName(request.recipientName());
        address.setRecipientPhone(request.recipientPhone());
        address.setDepartment(request.department());
        address.setCity(request.city());
        address.setZone(request.zone());
        address.setAddressLine(request.addressLine());
        address.setReference(request.reference());
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}