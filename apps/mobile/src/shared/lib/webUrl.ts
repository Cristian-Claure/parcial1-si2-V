import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";

/**
 * Web de la plataforma (onboarding de tiendas, edición de marca, mejora de plan). En el emulador
 * de Android el host de la PC es 10.0.2.2; se puede fijar con EXPO_PUBLIC_WEB_URL.
 */
const defaultWebUrl = Platform.OS === "android" ? "http://10.0.2.2:5173" : "http://127.0.0.1:5173";

export const webBaseUrl = (process.env.EXPO_PUBLIC_WEB_URL?.trim() || defaultWebUrl).replace(/\/$/, "");

export function openWeb(path: string): Promise<unknown> {
  return WebBrowser.openBrowserAsync(`${webBaseUrl}${path.startsWith("/") ? path : `/${path}`}`);
}
