from __future__ import annotations

import unittest

from app.tryon.models import TryOnJob, TryOnJobStatus
from app.tryon.providers import (
    TryOnProviderError,
    normalize_job_status,
    provider_for,
)
from app.tryon.service import (
    TryOnServiceError,
    _detect_content_type,
    _validate_category,
    tryon_capabilities,
)


class TryOnProviderContractTest(unittest.TestCase):
    def test_provider_scope_is_only_local_and_replicate(self) -> None:
        self.assertEqual(
            provider_for("local").status().name,
            "local",
        )
        self.assertEqual(
            provider_for("replicate").status().name,
            "replicate",
        )

        with self.assertRaises(TryOnProviderError):
            provider_for("fashn")

    def test_status_normalization(self) -> None:
        self.assertEqual(
            normalize_job_status("starting"),
            TryOnJobStatus.QUEUED,
        )
        self.assertEqual(
            normalize_job_status("processing"),
            TryOnJobStatus.PROCESSING,
        )
        self.assertEqual(
            normalize_job_status("succeeded"),
            TryOnJobStatus.SUCCEEDED,
        )
        self.assertEqual(
            normalize_job_status("failed"),
            TryOnJobStatus.FAILED,
        )
        self.assertEqual(
            normalize_job_status("canceled"),
            TryOnJobStatus.CANCELLED,
        )

    def test_image_signature_detection(self) -> None:
        self.assertEqual(
            _detect_content_type(
                b"\x89PNG\r\n\x1a\nrest"
            ),
            "image/png",
        )
        self.assertEqual(
            _detect_content_type(
                b"\xff\xd8\xffrest"
            ),
            "image/jpeg",
        )
        self.assertEqual(
            _detect_content_type(
                b"RIFFxxxxWEBPrest"
            ),
            "image/webp",
        )
        self.assertIsNone(
            _detect_content_type(b"not-an-image")
        )

    def test_category_is_strict(self) -> None:
        self.assertEqual(
            _validate_category("dress"),
            "DRESS",
        )

        with self.assertRaises(TryOnServiceError):
            _validate_category("unknown")

    def test_capabilities_do_not_expose_fashn(self) -> None:
        capabilities = tryon_capabilities()

        self.assertEqual(
            set(capabilities["providers"].keys()),
            {"local", "replicate"},
        )
        self.assertNotIn(
            "fashn",
            str(capabilities).lower(),
        )
        self.assertEqual(
            capabilities["phase"],
            "P11D_PROVIDER_CONTRACT",
        )

    def test_job_contract_is_stable(self) -> None:
        job = TryOnJob(
            provider="local",
            job_id="job-1",
            status=TryOnJobStatus.PROCESSING,
        )

        self.assertEqual(
            job.to_dict(),
            {
                "provider": "local",
                "jobId": "job-1",
                "status": "PROCESSING",
                "resultUrl": None,
                "error": None,
                "durationMs": None,
            },
        )


if __name__ == "__main__":
    unittest.main()
