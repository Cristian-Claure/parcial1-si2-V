package com.velora.customer;

import java.util.List;
import java.util.UUID;

import com.velora.auth.dto.UserProfileResponse;
import com.velora.customer.dto.*;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/customer")
public class CustomerController {

    private final CustomerService customers;

    public CustomerController(CustomerService customers) {
        this.customers = customers;
    }

    @GetMapping("/profile")
    public UserProfileResponse profile(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return customers.profile(userId(jwt));
    }

    @PutMapping("/profile")
    public UserProfileResponse updateProfile(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CustomerProfileUpdateRequest request
    ) {
        return customers.updateProfile(
                userId(jwt),
                request
        );
    }

    @GetMapping("/addresses")
    public List<CustomerAddressResponse> addresses(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return customers.listAddresses(userId(jwt));
    }

    @PostMapping("/addresses")
    @ResponseStatus(HttpStatus.CREATED)
    public CustomerAddressResponse createAddress(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CustomerAddressRequest request
    ) {
        return customers.createAddress(
                userId(jwt),
                request
        );
    }

    @PutMapping("/addresses/{addressId}")
    public CustomerAddressResponse updateAddress(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID addressId,
            @Valid @RequestBody CustomerAddressRequest request
    ) {
        return customers.updateAddress(
                userId(jwt),
                addressId,
                request
        );
    }

    @DeleteMapping("/addresses/{addressId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteAddress(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID addressId
    ) {
        customers.deleteAddress(
                userId(jwt),
                addressId
        );
    }

    private UUID userId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}