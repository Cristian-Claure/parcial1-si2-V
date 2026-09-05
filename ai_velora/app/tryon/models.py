from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class TryOnJobStatus(str, Enum):
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


@dataclass(frozen=True)
class TryOnImage:
    content: bytes
    content_type: str
    filename: str


@dataclass(frozen=True)
class TryOnJob:
    provider: str
    job_id: str
    status: TryOnJobStatus
    result_url: str | None = None
    error: str | None = None
    duration_ms: int | None = None

    def to_dict(self) -> dict[str, object]:
        return {
            "provider": self.provider,
            "jobId": self.job_id,
            "status": self.status.value,
            "resultUrl": self.result_url,
            "error": self.error,
            "durationMs": self.duration_ms,
        }
