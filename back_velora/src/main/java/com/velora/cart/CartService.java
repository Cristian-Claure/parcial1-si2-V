package com.velora.cart;

import java.util.List;
import java.util.UUID;

import com.velora.cart.dto.*;
import com.velora.catalog.product.ProductStatus;
import com.velora.catalog.variant.*;
import com.velora.user.*;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CartService {

    private final UserRepository users;
    private final ProductVariantRepository variants;
    private final ShoppingCartRepository carts;
    private final ShoppingCartItemRepository items;

    public CartService(
            UserRepository users,
            ProductVariantRepository variants,
            ShoppingCartRepository carts,
            ShoppingCartItemRepository items
    ) {
        this.users = users;
        this.variants = variants;
        this.carts = carts;
        this.items = items;
    }

    @Transactional(readOnly = true)
    public CartResponse getCart(UUID userId) {
        requireCustomer(userId);

        return carts.findByUserIdAndStatus(userId, CartStatus.ACTIVE)
                .map(this::response)
                .orElseGet(CartResponse::empty);
    }

    @Transactional
    public CartResponse addItem(
            UUID userId,
            AddCartItemRequest request
    ) {
        UserEntity user = requireCustomer(userId);
        ProductVariantEntity variant = requirePurchasableVariant(request.variantId());

        ShoppingCartEntity cart = activeCartForUpdate(user);

        ShoppingCartItemEntity item = items
                .findByCartIdAndVariantId(cart.getId(), variant.getId())
                .orElseGet(() -> {
                    ShoppingCartItemEntity created =
                            new ShoppingCartItemEntity();

                    created.setCart(cart);
                    created.setVariant(variant);
                    created.setQuantity(0);

                    return created;
                });

        int newQuantity = item.getQuantity() + request.quantity();

        if (newQuantity > 99) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "La cantidad máxima por variante en el carrito es 99."
            );
        }

        item.setQuantity(newQuantity);
        items.save(item);

        return response(cart);
    }

    @Transactional
    public CartResponse updateItem(
            UUID userId,
            UUID itemId,
            UpdateCartItemRequest request
    ) {
        requireCustomer(userId);

        lockActiveCart(userId);

        ShoppingCartItemEntity item = items
                .findActiveItemForCustomer(itemId, userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Artículo del carrito no encontrado."
                ));

        requirePurchasableVariant(item.getVariant().getId());

        item.setQuantity(request.quantity());
        items.save(item);

        return response(item.getCart());
    }

    @Transactional
    public CartResponse removeItem(
            UUID userId,
            UUID itemId
    ) {
        requireCustomer(userId);

        lockActiveCart(userId);

        ShoppingCartItemEntity item = items
                .findActiveItemForCustomer(itemId, userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Artículo del carrito no encontrado."
                ));

        ShoppingCartEntity cart = item.getCart();

        items.delete(item);
        items.flush();

        return response(cart);
    }

    @Transactional
    public void clearCart(UUID userId) {
        requireCustomer(userId);

        carts.findForUpdateByUserAndStatus(
                userId,
                CartStatus.ACTIVE
        ).ifPresent(
                cart -> items.deleteAllByCartId(
                        cart.getId()
                )
        );
    }

    private ShoppingCartEntity activeCartForUpdate(UserEntity user) {
        return carts.findForUpdateByUserAndStatus(user.getId(), CartStatus.ACTIVE)
                .orElseGet(() -> {
                    ShoppingCartEntity cart = new ShoppingCartEntity();
                    cart.setUser(user);
                    cart.setStatus(CartStatus.ACTIVE);
                    return carts.save(cart);
                });
    }

    private void lockActiveCart(
            UUID userId
    ) {
        carts.findForUpdateByUserAndStatus(
                userId,
                CartStatus.ACTIVE
        ).orElseThrow(() -> new ResponseStatusException(
                HttpStatus.NOT_FOUND,
                "Artículo del carrito no encontrado."
        ));
    }
    private ProductVariantEntity requirePurchasableVariant(UUID variantId) {
        ProductVariantEntity variant = variants.findById(variantId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Variante no encontrada."
                ));

        if (!variant.isActive()
                || variant.getProduct().getStatus() != ProductStatus.ACTIVE) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "La variante seleccionada no está disponible para la venta."
            );
        }

        return variant;
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

    private CartResponse response(ShoppingCartEntity cart) {
        List<CartItemResponse> responseItems = items
                .findAllForCart(cart.getId())
                .stream()
                .map(CartItemResponse::from)
                .toList();

        return CartResponse.of(
                cart.getId(),
                responseItems
        );
    }
}