package com.velora.bootstrap;

import com.velora.user.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Component
public class AdminBootstrap implements ApplicationRunner {
    private final UserRepository users;
    private final PasswordEncoder passwords;

    @Value("${velora.bootstrap.admin.email:}")
    private String email;

    @Value("${velora.bootstrap.admin.password:}")
    private String password;

    @Value("${velora.bootstrap.admin.first-name:Admin}")
    private String firstName;

    @Value("${velora.bootstrap.admin.last-name:Velora}")
    private String lastName;

    public AdminBootstrap(UserRepository users, PasswordEncoder passwords) {
        this.users = users;
        this.passwords = passwords;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!StringUtils.hasText(email) || !StringUtils.hasText(password)) {
            return;
        }

        if (users.existsByEmailIgnoreCase(email)) {
            return;
        }

        UserEntity admin = new UserEntity();
        admin.setFirstName(firstName);
        admin.setLastName(lastName);
        admin.setEmail(email);
        admin.setPasswordHash(passwords.encode(password));
        admin.setRole(UserRole.ADMIN);
        admin.setCustomerType(null);
        admin.setStatus(UserStatus.ACTIVE);
        admin.setStore(null);
        users.save(admin);
    }
}
