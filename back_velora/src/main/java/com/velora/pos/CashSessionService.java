package com.velora.pos;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

import com.velora.pos.dto.CashSessionResponse;
import com.velora.pos.dto.OpenCashSessionRequest;
import com.velora.user.UserEntity;
import com.velora.user.UserRepository;
import com.velora.user.UserRole;
import com.velora.user.UserStatus;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CashSessionService {

    private static final String DEFAULT_CURRENCY = "BOB";

    private final CashSessionRepository sessions;
    private final PointOfSaleRepository pointsOfSale;
    private final UserRepository users;

    public CashSessionService(
            CashSessionRepository sessions,
            PointOfSaleRepository pointsOfSale,
            UserRepository users
    ) {
        this.sessions = sessions;
        this.pointsOfSale = pointsOfSale;
        this.users = users;
    }

    @Transactional
    public CashSessionResponse open(
            UUID actorId,
            OpenCashSessionRequest request
    ) {
        UserEntity actor =
                requireOperationalActor(actorId);

        PointOfSaleEntity pointOfSale =
                pointsOfSale
                        .findById(request.pointOfSaleId())
                        .orElseThrow(() -> new ResponseStatusException(
                                HttpStatus.NOT_FOUND,
                                "Punto de venta no encontrado."
                        ));

        if (!pointOfSale.isActive()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El punto de venta está inactivo."
            );
        }

        if (!pointOfSale.getStore().isActive()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "La sucursal del punto de venta está inactiva."
            );
        }

        if (!pointOfSale.getWarehouse().isActive()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El almacén del punto de venta está inactivo."
            );
        }

        validateStoreAccess(
                actor,
                pointOfSale
        );

        if (sessions.existsByPointOfSale_IdAndStatus(
                pointOfSale.getId(),
                CashSessionStatus.OPEN
        )) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El punto de venta ya tiene una caja abierta."
            );
        }

        CashSessionEntity entity =
                new CashSessionEntity();

        entity.setSessionNumber(
                generateSessionNumber()
        );

        entity.setPointOfSale(
                pointOfSale
        );

        entity.setOpenedBy(
                actor
        );

        entity.setStatus(
                CashSessionStatus.OPEN
        );

        entity.setCurrency(
                DEFAULT_CURRENCY
        );

        entity.setOpeningAmount(
                request.openingAmount()
        );

        entity.setOpeningNotes(
                request.openingNotes()
        );

        try {
            sessions.saveAndFlush(entity);
        } catch (DataIntegrityViolationException ex) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El punto de venta ya tiene una caja abierta."
            );
        }

        return CashSessionResponse.from(
                entity
        );
    }

    @Transactional(readOnly = true)
    public CashSessionResponse getOpen(
            UUID actorId,
            UUID pointOfSaleId
    ) {
        UserEntity actor =
                requireOperationalActor(actorId);

        PointOfSaleEntity pointOfSale =
                pointsOfSale
                        .findById(pointOfSaleId)
                        .orElseThrow(() -> new ResponseStatusException(
                                HttpStatus.NOT_FOUND,
                                "Punto de venta no encontrado."
                        ));

        validateStoreAccess(
                actor,
                pointOfSale
        );

        CashSessionEntity session =
                sessions
                        .findByPointOfSale_IdAndStatus(
                                pointOfSaleId,
                                CashSessionStatus.OPEN
                        )
                        .orElseThrow(() -> new ResponseStatusException(
                                HttpStatus.NOT_FOUND,
                                "El punto de venta no tiene una caja abierta."
                        ));

        return CashSessionResponse.from(
                session
        );
    }

    private UserEntity requireOperationalActor(
            UUID actorId
    ) {
        UserEntity actor = users
                .findById(actorId)
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
            PointOfSaleEntity pointOfSale
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

        if (!actor.getStore()
                .getId()
                .equals(
                        pointOfSale
                                .getStore()
                                .getId()
                )) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "No puede operar una caja de otra sucursal."
            );
        }
    }

    private String generateSessionNumber() {
        String date = LocalDate
                .now(ZoneOffset.UTC)
                .format(
                        DateTimeFormatter.BASIC_ISO_DATE
                );

        String random = UUID
                .randomUUID()
                .toString()
                .replace("-", "")
                .substring(0, 12)
                .toUpperCase();

        return "CS-"
                + date
                + "-"
                + random;
    }
}