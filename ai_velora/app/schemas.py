from typing import Literal

from pydantic import BaseModel, Field


class AssistantHistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1200)


class ProductAssistantRequest(BaseModel):
    message: str = Field(min_length=2, max_length=800)
    history: list[AssistantHistoryItem] = Field(
        default_factory=list,
        max_length=8,
    )


class ProductRecommendation(BaseModel):
    productId: str
    reason: str = Field(min_length=1, max_length=420)
    variantIds: list[str] = Field(
        default_factory=list,
        max_length=8,
    )


class AssistantDecision(BaseModel):
    reply: str = Field(min_length=1, max_length=1400)
    recommendations: list[ProductRecommendation] = Field(
        default_factory=list,
        max_length=4,
    )


class ProductAssistantResponse(BaseModel):
    reply: str
    recommendations: list[ProductRecommendation]
    model: str