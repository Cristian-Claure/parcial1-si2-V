package com.velora.pos;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.velora.payment.PaymentMethod;
import com.velora.payment.PaymentRepository;
import com.velora.payment.PaymentStatus;
import com.velora.pos.dto.CashSessionResponse;
import com.velora.pos.dto.CloseCashSessionRequest;
import com.velora.user.UserEntity;
import com.velora.user.UserRepository;
import com.velora.user.UserRole;
import com.velora.user.UserStatus;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CashSessionCloseService {

    private final CashSessionRepository sessions;
    private final CashMovementRepository movements;
    private final PaymentRepository payments;
    private final UserRepository users;

    public CashSessionCloseService(
            CashSessionRepository sessions,
            CashMovementRepository movements,
            PaymentRepository payments,
            UserRepository users
    ) {
        this.sessions = sessions;
        this.movements = movements;
        this.payments = payments;
        this.users = users;
    }

    @Transactional
    public CashSessionResponse close(
            UUID actorId,
            UUID sessionId,
            CloseCashSessionRequest request
    ) {
        UserEntity actor =
                requireOperationalActor(actorId);

        CashSessionEntity session =
                sessions.findForUpdateById(sessionId)
                        .orElseThrow(() -> new ResponseStatusException(
                                HttpStatus.NOT_FOUND,
                                "Sesión de caja no encontrada."
                        ));

        validateStoreAccess(
                actor,
                session
        );

        if (session.getStatus()
                != CashSessionStatus.OPEN) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "La caja ya se encuentra cerrada."
            );
        }

        long pendingPayments =
                payments.countByCashSessionAndStatus(
                        session.getId(),
                        PaymentStatus.PENDING
                );

        if (pendingPayments > 0) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "No puede cerrarse la caja mientras existan pagos POS pendientes."
            );
        }

        BigDecimal expected =
                calculateExpectedCash(session);

        if (expected.signum() < 0) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El efectivo esperado de la caja no puede ser negativo."
            );
        }

        BigDecimal counted =
                request.countedCashAmount();

        BigDecimal difference =
                counted.subtract(expected);

        session.setExpectedCashAmount(
                expected
        );

        session.setCountedCashAmount(
                counted
        );

        session.setCashDifference(
                difference
        );

        session.setClosingNotes(
                request.closingNotes()
        );

        session.setClosedBy(
                actor
        );

        session.setClosedAt(
                Instant.now()
        );

        session.setStatus(
                CashSessionStatus.CLOSED
        );

        sessions.saveAndFlush(
                session
        );

        return CashSessionResponse.from(
                session
        );
    }

    private BigDecimal calculateExpectedCash(
            CashSessionEntity session
    ) {
        BigDecimal expected =
                session.getOpeningAmount();

        List<CashMovementEntity> sessionMovements =
                movements
                        .findAllByCashSession_IdOrderByCreatedAtAsc(
                                session.getId()
                        );

        for (CashMovementEntity movement
                : sessionMovements) {

            if (movement.getMovementType()
                    == CashMovementType.CASH_IN) {

                expected =
                        expected.add(
                                movement.getAmount()
                        );

            } else if (movement.getMovementType()
                    == CashMovementType.CASH_OUT) {

                expected =
                        expected.subtract(
                                movement.getAmount()
                        );
            }
        }

        BigDecimal paidCash =
                payments
                        .sumAmountByCashSessionAndMethodAndStatus(
                                session.getId(),
                                PaymentMethod.CASH,
                                PaymentStatus.PAID
                        );

        /*
         * Los reembolsos actuales son completos.
         * Cuando un pago pasa de PAID a REFUNDED deja
         * automáticamente de contribuir al efectivo esperado.
         */
        expected =
                expected.add(
                        paidCash
                );

        return expected;
    }

    private UserEntity requireOperationalActor(
            UUID actorId
    ) {
        UserEntity actor =
                users.findById(actorId)
                        .orElseThrow(() -> new ResponseStatusException(
                                HttpStatus.UNAUTHORIZED,
                                "Usuario autenticado no encontrado."
                        ));

        if (actor.getStatus()
                != UserStatus.ACTIVE) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "El usuario está inactivo."
            );
        }

        if (actor.getRole() != UserRole.ADMIN
                && actor.getRole() != UserRole.STORE_MANAGER) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "El usuario no tiene permisos para cerrar caja."
            );
        }

        return actor;
    }

    private void validateStoreAccess(
            UserEntity actor,
            CashSessionEntity session
    ) {
        if (actor.getRole()
                == UserRole.ADMIN) {
            return;
        }

        if (actor.getStore() == null) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "El encargado no tiene una sucursal asignada."
            );
        }

        UUID actorStoreId =
                actor.getStore().getId();

        UUID sessionStoreId =
                session
                        .getPointOfSale()
                        .getStore()
                        .getId();

        if (!actorStoreId.equals(
                sessionStoreId
        )) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "No puede cerrar una caja de otra sucursal."
            );
        }
    }
}