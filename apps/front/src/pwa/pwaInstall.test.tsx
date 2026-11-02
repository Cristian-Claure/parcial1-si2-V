import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isIosSafari, startPwaInstallCapture, stopPwaInstallCapture } from "./pwaInstall";
import { usePwaInstall } from "./usePwaInstall";
import { InstallAppButton } from "./InstallAppButton";

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1",
  ipadAsMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
};

/** beforeinstallprompt simulado: prompt() resuelve y userChoice devuelve el resultado elegido. */
function fakeInstallPrompt(outcome: "accepted" | "dismissed") {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: ReturnType<typeof vi.fn>; userChoice: Promise<unknown> };
  event.prompt = vi.fn(() => Promise.resolve());
  event.userChoice = Promise.resolve({ outcome, platform: "web" });
  return event;
}

let standalone = false;
function setNavigator(userAgent: string, extra: { platform?: string; maxTouchPoints?: number; standalone?: boolean } = {}) {
  Object.defineProperty(window.navigator, "userAgent", { value: userAgent, configurable: true });
  Object.defineProperty(window.navigator, "platform", { value: extra.platform ?? "Win32", configurable: true });
  Object.defineProperty(window.navigator, "maxTouchPoints", { value: extra.maxTouchPoints ?? 0, configurable: true });
  Object.defineProperty(window.navigator, "standalone", { value: extra.standalone, configurable: true });
}

beforeEach(() => {
  standalone = false;
  window.matchMedia = vi.fn((query: string) => ({
    matches: query === "(display-mode: standalone)" && standalone, media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  setNavigator(UA.androidChrome);
});
afterEach(() => { stopPwaInstallCapture(); });

describe("isIosSafari", () => {
  it("reconoce Safari de iPhone y de iPadOS (que se anuncia como Mac táctil)", () => {
    expect(isIosSafari({ userAgent: UA.iphoneSafari, maxTouchPoints: 5, platform: "iPhone" })).toBe(true);
    expect(isIosSafari({ userAgent: UA.ipadAsMac, maxTouchPoints: 5, platform: "MacIntel" })).toBe(true);
  });
  it("descarta Chrome de iOS, Safari de Mac y Android", () => {
    expect(isIosSafari({ userAgent: UA.iphoneChrome, maxTouchPoints: 5, platform: "iPhone" })).toBe(false);
    expect(isIosSafari({ userAgent: UA.macSafari, maxTouchPoints: 0, platform: "MacIntel" })).toBe(false);
    expect(isIosSafari({ userAgent: UA.androidChrome, maxTouchPoints: 5, platform: "Linux armv8l" })).toBe(false);
  });
});

describe("usePwaInstall", () => {
  it("guarda beforeinstallprompt (con preventDefault) y habilita la instalación", () => {
    startPwaInstallCapture(window);
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.canInstall).toBe(false);
    const event = fakeInstallPrompt("accepted");
    act(() => { window.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    expect(result.current).toMatchObject({ canInstall: true, isInstalled: false, needsIosSteps: false });
  });

  it("install() llama a prompt() una sola vez y marca la app como instalada si se acepta", async () => {
    startPwaInstallCapture(window);
    const { result } = renderHook(() => usePwaInstall());
    const event = fakeInstallPrompt("accepted");
    act(() => { window.dispatchEvent(event); });
    let outcome = "";
    await act(async () => { outcome = await result.current.install(); });
    expect(outcome).toBe("accepted");
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ canInstall: false, isInstalled: true });
    await act(async () => { outcome = await result.current.install(); });
    expect(outcome).toBe("unavailable");
  });

  it("si el usuario lo rechaza, el evento se descarta y el botón se oculta hasta un nuevo aviso", async () => {
    startPwaInstallCapture(window);
    const { result } = renderHook(() => usePwaInstall());
    act(() => { window.dispatchEvent(fakeInstallPrompt("dismissed")); });
    await act(async () => { await result.current.install(); });
    expect(result.current).toMatchObject({ canInstall: false, isInstalled: false });
  });

  it("appinstalled oculta el botón", () => {
    startPwaInstallCapture(window);
    const { result } = renderHook(() => usePwaInstall());
    act(() => { window.dispatchEvent(fakeInstallPrompt("accepted")); });
    act(() => { window.dispatchEvent(new Event("appinstalled")); });
    expect(result.current).toMatchObject({ canInstall: false, isInstalled: true });
  });

  it("display-mode standalone cuenta como instalada (no ofrece instalar)", () => {
    standalone = true;
    startPwaInstallCapture(window);
    const { result } = renderHook(() => usePwaInstall());
    act(() => { window.dispatchEvent(fakeInstallPrompt("accepted")); });
    expect(result.current).toMatchObject({ canInstall: false, isInstalled: true });
  });

  it("navigator.standalone de iOS cuenta como instalada", () => {
    setNavigator(UA.iphoneSafari, { platform: "iPhone", maxTouchPoints: 5, standalone: true });
    startPwaInstallCapture(window);
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current).toMatchObject({ isInstalled: true, needsIosSteps: false });
  });
});

describe("InstallAppButton", () => {
  it("no aparece donde no se puede instalar", () => {
    startPwaInstallCapture(window);
    render(<InstallAppButton />);
    expect(screen.queryByRole("button", { name: /Instalar Trama/ })).toBeNull();
  });

  it("Chrome/Edge/Android: abre el diálogo nativo", async () => {
    startPwaInstallCapture(window);
    const event = fakeInstallPrompt("accepted");
    render(<InstallAppButton />);
    act(() => { window.dispatchEvent(event); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Instalar Trama/ })); });
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Instalar Trama/ })).toBeNull();
  });

  it("iOS Safari: muestra los pasos de Compartir en un diálogo accesible que se cierra con Escape", () => {
    setNavigator(UA.iphoneSafari, { platform: "iPhone", maxTouchPoints: 5 });
    startPwaInstallCapture(window);
    render(<InstallAppButton variant="nav" />);
    const button = screen.getByRole("button", { name: /Instalar Trama/ });
    button.focus();
    fireEvent.click(button);
    const dialog = screen.getByRole("dialog", { name: /Instala Trama/ });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveTextContent("Compartir");
    expect(dialog).toHaveTextContent("Añadir a pantalla de inicio");
    expect(screen.getByRole("button", { name: "Entendido" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(button).toHaveFocus();
  });

  it("instalada en iOS: el botón no aparece", () => {
    setNavigator(UA.iphoneSafari, { platform: "iPhone", maxTouchPoints: 5, standalone: true });
    startPwaInstallCapture(window);
    render(<InstallAppButton />);
    expect(screen.queryByRole("button", { name: /Instalar Trama/ })).toBeNull();
  });
});
