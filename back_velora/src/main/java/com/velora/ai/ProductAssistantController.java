package com.velora.ai;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/customer/assistant")
public class ProductAssistantController {

    private final ProductAssistantService assistant;

    public ProductAssistantController(
            ProductAssistantService assistant
    ) {
        this.assistant = assistant;
    }

    @PostMapping("/products")
    public ProductAssistantResponse recommend(
            @RequestBody ProductAssistantRequest request
    ) {
        return assistant.recommend(request);
    }
}