package com.velora.order.operations;

import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import com.velora.order.OrderEntity;
import com.velora.order.OrderRepository;
import com.velora.order.operations.dto.OperationalOrderResponse;
import com.velora.payment.PaymentRepository;
import com.velora.payment.dto.PaymentResponse;
import com.velora.user.UserEntity;
import com.velora.user.UserRepository;
import com.velora.user.UserRole;
import com.velora.user.UserStatus;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class OperationalOrderQueryService {

    private final OrderRepository orders;
    private final PaymentRepository payments;
    private final UserRepository users;

    public OperationalOrderQueryService(
            OrderRepository orders,
            PaymentRepository payments,
            UserRepository users
    ) {
        this.orders = orders;
        this.payments = payments;
        this.users = users;
    }

    @Transactional(readOnly = true)
    public List<OperationalOrderResponse> list(
            UUID actorId
    ) {
        UserEntity actor =
                requireOperationalActor(actorId);

        return orders.findAll()
                .stream()
                .filter(
                        order ->
                                canAccess(
                                        actor,
                                        order
                                )
                )
                .sorted(
                        Comparator
                                .comparing(
                                        OrderEntity::getCreatedAt
                                )
                                .reversed()
                )
                .map(this::response)
                .toList();
    }

    private OperationalOrderResponse response(
            OrderEntity order
    ) {
        UserEntity customer =
                order.getCustomer();

        String customerName =
                customer == null
                        ? "Cliente no identificado"
                        : customer.getFirstName()
                                + " "
                                + customer.getLastName();

        String customerEmail =
                customer == null
                        ? null
                        : customer.getEmail();

        List<PaymentResponse> paymentResponses =
                payments
                        .findAllByOrderIdOrderByCreatedAtDesc(
                                order.getId()
                        )
                        .stream()
                        .map(PaymentResponse::from)
                        .toList();

        return new OperationalOrderResponse(
                order.getId(),
                order.getOrderNumber(),

                customer == null
                        ? null
                        : customer.getId(),

                customerName,
                customerEmail,

                order.getWarehouse()
                        .getStore()
                        .getId(),

                order.getWarehouse()
                        .getStore()
                        .getName(),

                order.getWarehouse()
                        .getId(),

                order.getWarehouse()
                        .getName(),

                order.getOrderChannel(),
                order.getFulfillmentType(),
                order.getStatus(),

                order.getCurrency(),
                order.getTotal(),

                order.getCreatedAt(),
                order.getFulfilledAt(),
                order.getCancelledAt(),

                paymentResponses
        );
    }

    private UserEntity requireOperationalActor(
            UUID actorId
    ) {
        UserEntity actor = users
                .findById(actorId)
                .orElseThrow(
                        () ->
                                new ResponseStatusException(
                                        HttpStatus.UNAUTHORIZED,
                                        "Usuario autenticado no encontrado."
                                )
                );

        if (
                actor.getStatus() !=
                        UserStatus.ACTIVE
        ) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "El usuario está inactivo."
            );
        }

        if (
                actor.getRole() !=
                        UserRole.ADMIN &&
                actor.getRole() !=
                        UserRole.STORE_MANAGER
        ) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "El usuario no tiene permisos para consultar pedidos operativos."
            );
        }

        if (
                actor.getRole() ==
                        UserRole.STORE_MANAGER &&
                actor.getStore() == null
        ) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "El encargado no tiene una sucursal asignada."
            );
        }

        return actor;
    }

    private boolean canAccess(
            UserEntity actor,
            OrderEntity order
    ) {
        if (
                actor.getRole() ==
                        UserRole.ADMIN
        ) {
            return true;
        }

        return actor.getStore()
                .getId()
                .equals(
                        order.getWarehouse()
                                .getStore()
                                .getId()
                );
    }
}