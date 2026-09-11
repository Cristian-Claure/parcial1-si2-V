import { isConnectivityError } from "../api/apiClient";
import { readCache, saveCache } from "./mobileDb";

export async function cachedFetch<T>(
  scope: string,
  ownerId: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  try {
    const result = await fetcher();
    await saveCache(scope, ownerId, result);
    return result;
  } catch (error) {
    if (!isConnectivityError(error)) {
      throw error;
    }

    const cached = await readCache<T>(scope, ownerId);
    if (cached !== null) {
      return cached;
    }

    throw error;
  }
}