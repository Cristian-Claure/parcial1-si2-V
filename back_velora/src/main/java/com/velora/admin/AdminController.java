package com.velora.admin;

import java.util.List;
import com.velora.admin.dto.*;
import com.velora.auth.dto.UserProfileResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin")
public class AdminController {
    private final AdminService admin;

    public AdminController(AdminService admin) {
        this.admin = admin;
    }

    @GetMapping("/stores")
    public List<StoreResponse> stores() {
        return admin.listStores();
    }

    @PostMapping("/stores")
    public StoreResponse createStore(@Valid @RequestBody CreateStoreRequest request) {
        return admin.createStore(request);
    }

    @GetMapping("/users/managers")
    public List<UserProfileResponse> managers() {
        return admin.listManagers();
    }

    @PostMapping("/users/managers")
    public UserProfileResponse createManager(@Valid @RequestBody CreateManagerRequest request) {
        return admin.createManager(request);
    }
}
