package com.velora.audit;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class AuditWebMvcConfig
        implements WebMvcConfigurer {

    private final AuditMutationInterceptor interceptor;

    public AuditWebMvcConfig(
            AuditMutationInterceptor interceptor
    ) {
        this.interceptor = interceptor;
    }

    @Override
    public void addInterceptors(
            InterceptorRegistry registry
    ) {
        registry.addInterceptor(interceptor);
    }
}
