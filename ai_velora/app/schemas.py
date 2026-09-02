from datetime import date
from typing import Any, Literal

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


class ReportStoreOption(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=120)


class ReportInterpretRequest(BaseModel):
    question: str = Field(min_length=2, max_length=800)
    currentDate: date
    availableStores: list[ReportStoreOption] = Field(
        default_factory=list,
        max_length=100,
    )


class ReportIntent(BaseModel):
    focus: Literal[
        "OVERVIEW",
        "SALES",
        "ORDERS",
        "PAYMENTS",
        "INVENTORY",
        "PRODUCTS",
    ] = "OVERVIEW"
    fromDate: date | None = None
    toDate: date | None = None
    storeId: str | None = Field(
        default=None,
        max_length=80,
    )
    requestedChart: Literal[
        "AUTO",
        "LINE",
        "BAR",
        "DONUT",
        "TABLE",
    ] = "AUTO"


class ReportIntentResponse(BaseModel):
    intent: ReportIntent
    model: str


class ReportNarrativeRequest(BaseModel):
    question: str = Field(min_length=2, max_length=800)
    report: dict[str, Any]


class ReportNarrativeDecision(BaseModel):
    summary: str = Field(min_length=1, max_length=1800)
    insights: list[str] = Field(
        default_factory=list,
        max_length=6,
    )


class ReportNarrativeResponse(BaseModel):
    summary: str
    insights: list[str]
    model: str