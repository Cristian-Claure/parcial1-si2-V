package com.velora.catalog;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.velora.catalog.category.CategoryEntity;
import com.velora.catalog.category.CategoryRepository;
import com.velora.catalog.dto.CategoryRequest;
import com.velora.catalog.dto.CategoryResponse;
import com.velora.catalog.dto.ImageRequest;
import com.velora.catalog.dto.ImageResponse;
import com.velora.catalog.dto.ProductRequest;
import com.velora.catalog.dto.ProductResponse;
import com.velora.catalog.dto.VariantRequest;
import com.velora.catalog.dto.VariantResponse;
import com.velora.catalog.image.ProductImageEntity;
import com.velora.catalog.image.ProductImageRepository;
import com.velora.catalog.product.ProductEntity;
import com.velora.catalog.product.ProductRepository;
import com.velora.catalog.product.ProductStatus;
import com.velora.catalog.variant.ProductVariantEntity;
import com.velora.catalog.variant.ProductVariantRepository;
import com.velora.user.UserEntity;
import com.velora.user.UserRepository;

@Service
@Transactional
public class CatalogService {

    private final CategoryRepository categoryRepository;
    private final ProductRepository productRepository;
    private final ProductVariantRepository variantRepository;
    private final ProductImageRepository imageRepository;
    private final UserRepository userRepository;

    public CatalogService(
            CategoryRepository categoryRepository,
            ProductRepository productRepository,
            ProductVariantRepository variantRepository,
            ProductImageRepository imageRepository,
            UserRepository userRepository
    ) {
        this.categoryRepository = categoryRepository;
        this.productRepository = productRepository;
        this.variantRepository = variantRepository;
        this.imageRepository = imageRepository;
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public List<CategoryResponse> listPublicCategories() {
        return categoryRepository.findAllByActiveTrueOrderByNameAsc()
                .stream()
                .map(this::toCategoryResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<CategoryResponse> listManagedCategories() {
        return categoryRepository.findAllByOrderByNameAsc()
                .stream()
                .map(this::toCategoryResponse)
                .toList();
    }

    public CategoryResponse createCategory(CategoryRequest request) {
        String slug = normalizeSlug(request.slug());

        if (categoryRepository.existsBySlugIgnoreCase(slug)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Ya existe una categoría con ese slug."
            );
        }

        CategoryEntity entity = new CategoryEntity();
        entity.setName(request.name());
        entity.setSlug(slug);
        entity.setDescription(request.description());
        entity.setParent(resolveCategoryNullable(request.parentId()));
        entity.setActive(request.active() == null || request.active());

        return toCategoryResponse(categoryRepository.save(entity));
    }

    public CategoryResponse updateCategory(UUID id, CategoryRequest request) {
        CategoryEntity entity = requireCategory(id);
        String slug = normalizeSlug(request.slug());

        if (!entity.getSlug().equalsIgnoreCase(slug)
                && categoryRepository.existsBySlugIgnoreCase(slug)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Ya existe una categoría con ese slug."
            );
        }

        CategoryEntity parent = resolveCategoryNullable(request.parentId());
        validateCategoryHierarchy(entity, parent);

        entity.setName(request.name());
        entity.setSlug(slug);
        entity.setDescription(request.description());
        entity.setParent(parent);

        if (request.active() != null) {
            entity.setActive(request.active());
        }

        return toCategoryResponse(categoryRepository.save(entity));
    }

    @Transactional(readOnly = true)
    public List<ProductResponse> listPublicProducts() {
        return productRepository
                .findAllByStatusOrderByNameAsc(ProductStatus.ACTIVE)
                .stream()
                .map(this::toProductResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ProductResponse> listManagedProducts() {
        return productRepository.findAllByOrderByNameAsc()
                .stream()
                .map(this::toProductResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public ProductResponse getPublicProduct(UUID id) {
        ProductEntity product = requireProduct(id);

        if (product.getStatus() != ProductStatus.ACTIVE) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Producto no encontrado."
            );
        }

        return toProductResponse(product);
    }

    @Transactional(readOnly = true)
    public ProductResponse getManagedProduct(UUID id) {
        return toProductResponse(requireProduct(id));
    }

    @Transactional(readOnly = true)
    public List<VariantResponse> listPublicVariants(UUID productId) {
        ProductEntity product = requireProduct(productId);

        if (product.getStatus() != ProductStatus.ACTIVE) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Producto no encontrado."
            );
        }

        return variantRepository
                .findAllByProductIdOrderByColorAscSizeAsc(productId)
                .stream()
                .filter(ProductVariantEntity::isActive)
                .map(this::toVariantResponse)
                .toList();
    }

    public ProductResponse createProduct(
            ProductRequest request,
            UUID actorId
    ) {
        String slug = normalizeSlug(request.slug());

        if (productRepository.existsBySlugIgnoreCase(slug)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Ya existe un producto con ese slug."
            );
        }

        CategoryEntity category = requireCategory(request.categoryId());

        if (!category.isActive()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "La categoría seleccionada está inactiva."
            );
        }

        UserEntity actor = requireActor(actorId);

        ProductEntity entity = new ProductEntity();
        entity.setCategory(category);
        entity.setName(request.name());
        entity.setSlug(slug);
        entity.setDescription(request.description());
        entity.setBrand(request.brand());
        entity.setComposition(request.composition());
        entity.setCareInstructions(request.careInstructions());
        entity.setFitNotes(request.fitNotes());
        entity.setStatus(
                request.status() == null
                        ? ProductStatus.ACTIVE
                        : request.status()
        );
        entity.setCreatedBy(actor);
        entity.setUpdatedBy(actor);

        return toProductResponse(productRepository.save(entity));
    }

    public ProductResponse updateProduct(
            UUID id,
            ProductRequest request,
            UUID actorId
    ) {
        ProductEntity entity = requireProduct(id);
        String slug = normalizeSlug(request.slug());

        if (!entity.getSlug().equalsIgnoreCase(slug)
                && productRepository.existsBySlugIgnoreCase(slug)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Ya existe un producto con ese slug."
            );
        }

        CategoryEntity category = requireCategory(request.categoryId());

        entity.setCategory(category);
        entity.setName(request.name());
        entity.setSlug(slug);
        entity.setDescription(request.description());
        entity.setBrand(request.brand());
        entity.setComposition(request.composition());
        entity.setCareInstructions(request.careInstructions());
        entity.setFitNotes(request.fitNotes());
        entity.setStatus(
                request.status() == null
                        ? entity.getStatus()
                        : request.status()
        );
        entity.setUpdatedBy(requireActor(actorId));

        return toProductResponse(productRepository.save(entity));
    }

    public VariantResponse createVariant(
            UUID productId,
            VariantRequest request
    ) {
        ProductEntity product = requireProduct(productId);
        String sku = request.sku().trim().toUpperCase();

        if (variantRepository.existsBySkuIgnoreCase(sku)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Ya existe una variante con ese SKU."
            );
        }

        validateVariant(request);

        ProductVariantEntity entity = new ProductVariantEntity();
        entity.setProduct(product);
        applyVariant(entity, request);
        entity.setActive(request.active() == null || request.active());

        return toVariantResponse(variantRepository.save(entity));
    }

    public VariantResponse updateVariant(
            UUID id,
            VariantRequest request
    ) {
        ProductVariantEntity entity = requireVariant(id);
        String sku = request.sku().trim().toUpperCase();

        if (!entity.getSku().equalsIgnoreCase(sku)
                && variantRepository.existsBySkuIgnoreCase(sku)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Ya existe una variante con ese SKU."
            );
        }

        validateVariant(request);
        applyVariant(entity, request);

        if (request.active() != null) {
            entity.setActive(request.active());
        }

        return toVariantResponse(variantRepository.save(entity));
    }

    public ImageResponse createImage(
            UUID productId,
            ImageRequest request
    ) {
        ProductEntity product = requireProduct(productId);

        ProductVariantEntity variant = null;

        if (request.variantId() != null) {
            variant = requireVariant(request.variantId());

            if (!variant.getProduct().getId().equals(productId)) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "La variante no pertenece al producto indicado."
                );
            }
        }

        boolean primary = Boolean.TRUE.equals(request.primary());

        if (primary) {
            imageRepository
                    .findAllByProductIdOrderBySortOrderAsc(productId)
                    .forEach(image -> image.setPrimary(false));
        }

        ProductImageEntity entity = new ProductImageEntity();
        entity.setProduct(product);
        entity.setVariant(variant);
        entity.setImageUrl(request.imageUrl().trim());
        entity.setAltText(trimToNull(request.altText()));
        entity.setSortOrder(
                request.sortOrder() == null
                        ? 0
                        : request.sortOrder()
        );
        entity.setPrimary(primary);

        return toImageResponse(imageRepository.save(entity));
    }

    private void applyVariant(
            ProductVariantEntity entity,
            VariantRequest request
    ) {
        entity.setSku(request.sku());
        entity.setBarcode(trimToNull(request.barcode()));
        entity.setSize(request.size());
        entity.setColor(request.color());
        entity.setColorHex(trimToNull(request.colorHex()));
        entity.setPrice(request.price());
        entity.setCompareAtPrice(request.compareAtPrice());
        entity.setCurrency(
                request.currency() == null || request.currency().isBlank()
                        ? "BOB"
                        : request.currency()
        );
    }

    private void validateVariant(VariantRequest request) {
        if (request.compareAtPrice() != null
                && request.compareAtPrice().compareTo(request.price()) < 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "El precio anterior no puede ser menor al precio actual."
            );
        }

        String colorHex = trimToNull(request.colorHex());

        if (colorHex != null
                && !colorHex.matches("^#[0-9A-Fa-f]{6}$")) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "El color hexadecimal debe tener formato #RRGGBB."
            );
        }
    }

    private void validateCategoryHierarchy(
            CategoryEntity entity,
            CategoryEntity parent
    ) {
        CategoryEntity cursor = parent;

        while (cursor != null) {
            if (cursor.getId().equals(entity.getId())) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Una categoría no puede ser descendiente de sí misma."
                );
            }

            cursor = cursor.getParent();
        }
    }

    private CategoryEntity resolveCategoryNullable(UUID id) {
        return id == null ? null : requireCategory(id);
    }

    private CategoryEntity requireCategory(UUID id) {
        return categoryRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Categoría no encontrada."
                ));
    }

    private ProductEntity requireProduct(UUID id) {
        return productRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Producto no encontrado."
                ));
    }

    private ProductVariantEntity requireVariant(UUID id) {
        return variantRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Variante no encontrada."
                ));
    }

    private UserEntity requireActor(UUID id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED,
                        "Usuario autenticado no encontrado."
                ));
    }

    private String normalizeSlug(String slug) {
        return slug.trim().toLowerCase();
    }

    private String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        return value.trim();
    }

    private CategoryResponse toCategoryResponse(CategoryEntity entity) {
        CategoryEntity parent = entity.getParent();

        return new CategoryResponse(
                entity.getId(),
                parent == null ? null : parent.getId(),
                parent == null ? null : parent.getName(),
                entity.getName(),
                entity.getSlug(),
                entity.getDescription(),
                entity.isActive()
        );
    }

    private ProductResponse toProductResponse(ProductEntity entity) {
        return new ProductResponse(
                entity.getId(),
                entity.getCategory().getId(),
                entity.getCategory().getName(),
                entity.getName(),
                entity.getSlug(),
                entity.getDescription(),
                entity.getBrand(),
                entity.getComposition(),
                entity.getCareInstructions(),
                entity.getFitNotes(),
                entity.getStatus(),
                variantRepository
                        .findAllByProductIdOrderByColorAscSizeAsc(entity.getId())
                        .stream()
                        .map(this::toVariantResponse)
                        .toList(),
                imageRepository
                        .findAllByProductIdOrderBySortOrderAsc(entity.getId())
                        .stream()
                        .map(this::toImageResponse)
                        .toList()
        );
    }

    private VariantResponse toVariantResponse(ProductVariantEntity entity) {
        return new VariantResponse(
                entity.getId(),
                entity.getSku(),
                entity.getBarcode(),
                entity.getSize(),
                entity.getColor(),
                entity.getColorHex(),
                entity.getPrice(),
                entity.getCompareAtPrice(),
                entity.getCurrency(),
                entity.isActive()
        );
    }

    private ImageResponse toImageResponse(ProductImageEntity entity) {
        return new ImageResponse(
                entity.getId(),
                entity.getVariant() == null
                        ? null
                        : entity.getVariant().getId(),
                entity.getImageUrl(),
                entity.getAltText(),
                entity.getSortOrder(),
                entity.isPrimary()
        );
    }
}