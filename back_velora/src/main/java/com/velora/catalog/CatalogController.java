package com.velora.catalog;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import com.velora.catalog.asset.CatalogAssetService;
import com.velora.catalog.dto.CategoryRequest;
import com.velora.catalog.dto.CategoryResponse;
import com.velora.catalog.dto.ImageRequest;
import com.velora.catalog.dto.ImageResponse;
import com.velora.catalog.dto.ProductRequest;
import com.velora.catalog.dto.ProductResponse;
import com.velora.catalog.dto.VariantRequest;
import com.velora.catalog.dto.VariantResponse;
import com.velora.catalog.image.ProductImagePurpose;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/catalog")
public class CatalogController {

    private final CatalogService catalogService;
    private final CatalogAssetService catalogAssetService;

    public CatalogController(
            CatalogService catalogService,
            CatalogAssetService catalogAssetService
    ) {
        this.catalogService = catalogService;
        this.catalogAssetService = catalogAssetService;
    }

    @GetMapping("/categories")
    public List<CategoryResponse> categories() {
        return catalogService.listPublicCategories();
    }

    @GetMapping("/products")
    public List<ProductResponse> products() {
        return catalogService.listPublicProducts();
    }

    @GetMapping("/products/{id}")
    public ProductResponse product(@PathVariable UUID id) {
        return catalogService.getPublicProduct(id);
    }

    @GetMapping("/products/{id}/variants")
    public List<VariantResponse> variants(@PathVariable UUID id) {
        return catalogService.listPublicVariants(id);
    }

    @GetMapping("/manage/categories")
    public List<CategoryResponse> managedCategories() {
        return catalogService.listManagedCategories();
    }

    @PostMapping("/manage/categories")
    public ResponseEntity<CategoryResponse> createCategory(
            @Valid @RequestBody CategoryRequest request
    ) {
        CategoryResponse created = catalogService.createCategory(request);

        return ResponseEntity
                .created(URI.create(
                        "/api/catalog/manage/categories/" + created.id()
                ))
                .body(created);
    }

    @PutMapping("/manage/categories/{id}")
    public CategoryResponse updateCategory(
            @PathVariable UUID id,
            @Valid @RequestBody CategoryRequest request
    ) {
        return catalogService.updateCategory(id, request);
    }

    @GetMapping("/manage/products")
    public List<ProductResponse> managedProducts() {
        return catalogService.listManagedProducts();
    }

    @GetMapping("/manage/products/{id}")
    public ProductResponse managedProduct(@PathVariable UUID id) {
        return catalogService.getManagedProduct(id);
    }

    @PostMapping("/manage/products")
    public ResponseEntity<ProductResponse> createProduct(
            @Valid @RequestBody ProductRequest request,
            @AuthenticationPrincipal Jwt jwt
    ) {
        ProductResponse created = catalogService.createProduct(
                request,
                actorId(jwt)
        );

        return ResponseEntity
                .created(URI.create(
                        "/api/catalog/manage/products/" + created.id()
                ))
                .body(created);
    }

    @PutMapping("/manage/products/{id}")
    public ProductResponse updateProduct(
            @PathVariable UUID id,
            @Valid @RequestBody ProductRequest request,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return catalogService.updateProduct(
                id,
                request,
                actorId(jwt)
        );
    }

    @PostMapping("/manage/products/{productId}/variants")
    public ResponseEntity<VariantResponse> createVariant(
            @PathVariable UUID productId,
            @Valid @RequestBody VariantRequest request
    ) {
        VariantResponse created = catalogService.createVariant(
                productId,
                request
        );

        return ResponseEntity.ok(created);
    }

    @PutMapping("/manage/variants/{id}")
    public VariantResponse updateVariant(
            @PathVariable UUID id,
            @Valid @RequestBody VariantRequest request
    ) {
        return catalogService.updateVariant(id, request);
    }

    @PostMapping("/manage/products/{productId}/images")
    public ResponseEntity<ImageResponse> createImage(
            @PathVariable UUID productId,
            @Valid @RequestBody ImageRequest request
    ) {
        return ResponseEntity.ok(
                catalogService.createImage(productId, request)
        );
    }

    @PostMapping(
            value = "/manage/products/{productId}/images/upload",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public ResponseEntity<ImageResponse> uploadImage(
            @PathVariable UUID productId,
            @RequestParam(required = false) UUID variantId,
            @RequestParam(required = false) String altText,
            @RequestParam(defaultValue = "GALLERY")
            ProductImagePurpose purpose,
            @RequestParam(defaultValue = "0") Integer sortOrder,
            @RequestParam(defaultValue = "false") Boolean primary,
            @RequestParam("file") MultipartFile file
    ) {
        return ResponseEntity.ok(
                catalogAssetService.uploadProductImage(
                        productId,
                        variantId,
                        altText,
                        purpose,
                        sortOrder,
                        primary,
                        file
                )
        );
    }

    @GetMapping("/assets/{storageKey:.+}")
    public ResponseEntity<Resource> catalogAsset(
            @PathVariable String storageKey
    ) {
        var loaded = catalogAssetService.load(storageKey);

        return ResponseEntity.ok()
                .contentType(
                        MediaType.parseMediaType(
                                loaded.contentType()
                        )
                )
                .body(loaded.resource());
    }

    private UUID actorId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}