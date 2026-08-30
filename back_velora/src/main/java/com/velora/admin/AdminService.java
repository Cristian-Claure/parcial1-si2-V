package com.velora.admin;

import java.util.List;
import com.velora.admin.dto.*;
import com.velora.auth.dto.UserProfileResponse;
import com.velora.store.*;
import com.velora.user.*;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AdminService {
    private final StoreRepository stores;
    private final UserRepository users;
    private final PasswordEncoder passwords;

    public AdminService(StoreRepository stores, UserRepository users, PasswordEncoder passwords) {
        this.stores = stores;
        this.users = users;
        this.passwords = passwords;
    }

    @Transactional
    public StoreResponse createStore(CreateStoreRequest request) {
        if (stores.existsByCodeIgnoreCase(request.code())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ya existe una sucursal con ese código.");
        }

        StoreEntity store = new StoreEntity();
        store.setCode(request.code());
        store.setName(request.name());
        store.setAddress(request.address());
        store.setActive(true);

        return StoreResponse.from(stores.save(store));
    }

    @Transactional(readOnly = true)
    public List<StoreResponse> listStores() {
        return stores.findAllByOrderByNameAsc().stream()
                .map(StoreResponse::from)
                .toList();
    }

    @Transactional
    public UserProfileResponse createManager(CreateManagerRequest request) {
        String email = request.email().trim().toLowerCase();

        if (users.existsByEmailIgnoreCase(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ya existe un usuario con este correo.");
        }

        StoreEntity store = stores.findById(request.storeId())
                .filter(StoreEntity::isActive)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "La sucursal seleccionada no existe o está inactiva."
                ));

        UserEntity manager = new UserEntity();
        manager.setFirstName(request.firstName());
        manager.setLastName(request.lastName());
        manager.setEmail(email);
        manager.setPasswordHash(passwords.encode(request.password()));
        manager.setRole(UserRole.STORE_MANAGER);
        manager.setCustomerType(null);
        manager.setStatus(UserStatus.ACTIVE);
        manager.setStore(store);

        return UserProfileResponse.from(users.save(manager));
    }

    @Transactional(readOnly = true)
    public List<UserProfileResponse> listManagers() {
        return users.findAllByRoleOrderByFirstNameAscLastNameAsc(UserRole.STORE_MANAGER)
                .stream()
                .map(UserProfileResponse::from)
                .toList();
    }
}
