import { Platform } from "react-native";
import type { ProductResponse } from "@velora/contracts";
import { apiBaseUrl } from "../../core/api/apiClient";

// The backend bakes a single VELORA_PUBLIC_BACKEND_URL into every managed-asset image
// URL it returns (CatalogService.imageResponse()), with no idea which client is asking.
// That host is correct for a browser on the same machine, but the Android emulator
// can't reach 127.0.0.1/localhost that way -- it needs 10.0.2.2 to reach the host
// machine, the exact case apiClient.ts already special-cases for its own base URL.
// Without this, expo-image just fails the request silently and renders nothing.
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);

function resolveAssetUrl(url: string): string {
  if (Platform.OS !== "android") {
    return url;
  }

  try {
    const parsed = new URL(url);
    if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
      return url;
    }

    const target = new URL(apiBaseUrl);
    parsed.protocol = target.protocol;
    parsed.hostname = target.hostname;
    parsed.port = target.port;
    return parsed.toString();
  } catch {
    return url;
  }
}

export function primaryImage(product: ProductResponse): string | null {
  const url =
    product.images.find((image) => image.primary)?.imageUrl ??
    product.images[0]?.imageUrl ??
    null;

  return url ? resolveAssetUrl(url) : null;
}
