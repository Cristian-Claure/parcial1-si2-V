package com.velora.customer;

import java.util.List;
import java.util.UUID;

import com.velora.catalog.product.ProductEntity;
import com.velora.catalog.product.ProductRepository;
import com.velora.catalog.product.ProductStatus;
import com.velora.customer.dto.CustomerFavoriteResponse;
import com.velora.user.UserEntity;
import com.velora.user.UserRepository;
import com.velora.user.UserRole;
import com.velora.user.UserStatus;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CustomerFavoriteService {

    private final UserRepository users;
    private final ProductRepository products;
    private final CustomerFavoriteRepository favorites;

    public CustomerFavoriteService(
            UserRepository users,
            ProductRepository products,
            CustomerFavoriteRepository favorites
    ) {
        this.users = users;
        this.products = products;
        this.favorites = favorites;
    }

    @Transactional(readOnly = true)
    public List<CustomerFavoriteResponse> list(
            UUID customerId
    ) {
        requireCustomer(customerId);

        return favorites
                .findAllByCustomerIdOrderByCreatedAtDesc(customerId)
                .stream()
                .filter(
                        favorite ->
                                favorite.getProduct().getStatus()
                                        == ProductStatus.ACTIVE
                )
                .map(CustomerFavoriteResponse::from)
                .toList();
    }

    @Transactional
    public CustomerFavoriteResponse add(
            UUID customerId,
            UUID productId
    ) {
        UserEntity customer =
                requireCustomer(customerId);

        ProductEntity product =
                requireActiveProduct(productId);

        return favorites
                .findByCustomerIdAndProductId(
                        customerId,
                        productId
                )
                .map(CustomerFavoriteResponse::from)
                .orElseGet(() -> {
                    CustomerFavoriteEntity favorite =
                            new CustomerFavoriteEntity();

                    favorite.setCustomer(customer);
                    favorite.setProduct(product);

                    return CustomerFavoriteResponse.from(
                            favorites.save(favorite)
                    );
                });
    }

    @Transactional
    public void remove(
            UUID customerId,
            UUID productId
    ) {
        requireCustomer(customerId);

        favorites
                .findByCustomerIdAndProductId(
                        customerId,
                        productId
                )
                .ifPresent(favorites::delete);
    }

    private UserEntity requireCustomer(
            UUID customerId
    ) {
        UserEntity customer =
                users.findById(customerId)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.UNAUTHORIZED,
                                                "Cliente autenticado no encontrado."
                                        )
                        );

        if (
                customer.getRole() !=
                        UserRole.CUSTOMER
        ) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "La operación está disponible únicamente para clientes."
            );
        }

        if (
                customer.getStatus() !=
                        UserStatus.ACTIVE
        ) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "La cuenta del cliente no está activa."
            );
        }

        return customer;
    }

    private ProductEntity requireActiveProduct(
            UUID productId
    ) {
        ProductEntity product =
                products.findById(productId)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND,
                                                "Producto no encontrado."
                                        )
                        );

        if (
                product.getStatus() !=
                        ProductStatus.ACTIVE
        ) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El producto ya no está disponible."
            );
        }

        return product;
    }
}