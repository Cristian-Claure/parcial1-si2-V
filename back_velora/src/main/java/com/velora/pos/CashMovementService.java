package com.velora.pos;

import java.util.List;
import java.util.UUID;

import com.velora.pos.dto.CashMovementRequest;
import com.velora.pos.dto.CashMovementResponse;
import com.velora.user.UserEntity;
import com.velora.user.UserRepository;
import com.velora.user.UserRole;
import com.velora.user.UserStatus;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CashMovementService {

    private final CashSessionRepository sessions;
    private final CashMovementRepository movements;
    private final UserRepository users;

    public CashMovementService(
            CashSessionRepository sessions,
            CashMovementRepository movements,
            UserRepository users
    ) {
        this.sessions = sessions;
        this.movements = movements;
        this.users = users;
    }

    @Transactional
    public CashMovementResponse register(
            UUID actorId,
            UUID sessionId,
            CashMovementRequest request
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
                    "No se pueden registrar movimientos en una caja cerrada."
            );
        }

        CashMovementEntity movement =
                new CashMovementEntity();

        movement.setCashSession(
                session
        );

        movement.setMovementType(
                request.movementType()
        );

        movement.setAmount(
                request.amount()
        );

        movement.setReason(
                request.reason()
        );

        movement.setCreatedBy(
                actor
        );

        movements.saveAndFlush(
                movement
        );

        return CashMovementResponse.from(
                movement
        );
    }

    @Transactional(readOnly = true)
    public List<CashMovementResponse> list(
            UUID actorId,
            UUID sessionId
    ) {
        UserEntity actor =
                requireOperationalActor(actorId);

        CashSessionEntity session =
                sessions.findById(sessionId)
                        .orElseThrow(() -> new ResponseStatusException(
                                HttpStatus.NOT_FOUND,
                                "Sesión de caja no encontrada."
                        ));

        validateStoreAccess(
                actor,
                session
        );

        return movements
                .findAllByCashSession_IdOrderByCreatedAtAsc(
                        sessionId
                )
                .stream()
                .map(CashMovementResponse::from)
                .toList();
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
                    "El usuario no tiene permisos para operar caja."
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
                    "No puede operar una caja de otra sucursal."
            );
        }
    }
}