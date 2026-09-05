from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    openai_api_key: str = ""
    velora_ai_model: str = "gpt-5.6-luna"
    velora_ai_transcribe_model: str = "gpt-4o-mini-transcribe"
    velora_ai_internal_token: str = ""
    velora_backend_url: str = "http://127.0.0.1:8080"
    velora_ai_max_catalog_products: int = 120

    # Virtual Try-On: LOCAL benchmark + Replicate cloud.
    velora_tryon_provider: str = "replicate"
    replicate_api_token: str = ""
    velora_tryon_replicate_model: str = "prunaai/p-image-try-on"
    velora_tryon_local_url: str = ""
    velora_tryon_local_model: str = ""
    velora_tryon_max_input_bytes: int = 5242880
    velora_tryon_provider_timeout_seconds: float = 30.0

    model_config = SettingsConfigDict(
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()