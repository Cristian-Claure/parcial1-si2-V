from typing import Any

from .schemas import (
    AssistantDecision,
    ProductRecommendation,
)


def sanitize_decision(
    decision: AssistantDecision,
    catalog: list[dict[str, Any]],
) -> AssistantDecision:
    product_map = {
        str(product["id"]): product
        for product in catalog
        if product.get("id")
    }

    safe: list[ProductRecommendation] = []
    seen: set[str] = set()

    for recommendation in decision.recommendations:
        product_id = recommendation.productId

        if (
            product_id in seen
            or product_id not in product_map
        ):
            continue

        product = product_map[product_id]

        valid_variant_ids = {
            str(variant["id"])
            for variant in product.get("variants", [])
            if variant.get("id")
        }

        safe_variant_ids = [
            variant_id
            for variant_id in recommendation.variantIds
            if variant_id in valid_variant_ids
        ]

        safe.append(
            ProductRecommendation(
                productId=product_id,
                reason=recommendation.reason.strip(),
                variantIds=safe_variant_ids,
            )
        )

        seen.add(product_id)

        if len(safe) == 4:
            break

    return AssistantDecision(
        reply=decision.reply.strip(),
        recommendations=safe,
    )