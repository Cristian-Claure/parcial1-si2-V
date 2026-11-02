/**
 * Instalación de la PWA de Trama. `beforeinstallprompt` puede dispararse antes de que React monte,
 * por eso la captura vive a nivel de módulo (main.tsx la arranca) y el hook solo la lee.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

export interface PwaInstallSnapshot {
  /** Chrome/Edge/Android: hay un `beforeinstallprompt` guardado. */
  canInstall: boolean;
  /** La app corre instalada (display-mode standalone o navigator.standalone de iOS). */
  isInstalled: boolean;
  /** iOS Safari: no hay `beforeinstallprompt`; se instala a mano desde Compartir. */
  needsIosSteps: boolean;
}

type NavigatorLike = Pick<Navigator, "userAgent" | "maxTouchPoints"> & { platform?: string; standalone?: boolean };

/** Safari de iPhone/iPad (incluye iPadOS que se anuncia como Mac); excluye Chrome, Firefox, Edge y Opera de iOS. */
export function isIosSafari(nav: NavigatorLike): boolean {
  const ua = nav.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  return ios && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
}

export function isStandalone(win: Window): boolean {
  const media = typeof win.matchMedia === "function" && win.matchMedia("(display-mode: standalone)").matches;
  return media || (win.navigator as NavigatorLike).standalone === true;
}

let target: Window | null = null;
let deferred: BeforeInstallPromptEvent | null = null;
let installedEvent = false;
let snapshot: PwaInstallSnapshot = { canInstall: false, isInstalled: false, needsIosSteps: false };
const listeners = new Set<() => void>();

function compute(): PwaInstallSnapshot {
  if (!target) return { canInstall: false, isInstalled: false, needsIosSteps: false };
  const isInstalled = installedEvent || isStandalone(target);
  return { canInstall: !isInstalled && deferred !== null, isInstalled, needsIosSteps: !isInstalled && isIosSafari(target.navigator) };
}

function emit(): void {
  const next = compute();
  if (next.canInstall === snapshot.canInstall && next.isInstalled === snapshot.isInstalled && next.needsIosSteps === snapshot.needsIosSteps) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

const onBeforeInstallPrompt = (event: Event) => { event.preventDefault(); deferred = event as BeforeInstallPromptEvent; emit(); };
const onAppInstalled = () => { deferred = null; installedEvent = true; emit(); };

/** Idempotente: registra los oyentes una sola vez por ventana. */
export function startPwaInstallCapture(win: Window = window): void {
  if (target === win) return;
  stopPwaInstallCapture();
  target = win;
  win.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  win.addEventListener("appinstalled", onAppInstalled);
  if (typeof win.matchMedia === "function") win.matchMedia("(display-mode: standalone)").addEventListener?.("change", emit);
  snapshot = compute();
}

/** Para pruebas: suelta la ventana y olvida el estado. */
export function stopPwaInstallCapture(): void {
  if (target) {
    target.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    target.removeEventListener("appinstalled", onAppInstalled);
    if (typeof target.matchMedia === "function") target.matchMedia("(display-mode: standalone)").removeEventListener?.("change", emit);
  }
  target = null; deferred = null; installedEvent = false;
  snapshot = { canInstall: false, isInstalled: false, needsIosSteps: false };
}

export function subscribePwaInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getPwaInstallSnapshot(): PwaInstallSnapshot { return snapshot; }

/** Muestra el diálogo nativo. El evento solo sirve una vez: tras usarlo se descarta. */
export async function promptPwaInstall(): Promise<InstallOutcome> {
  const event = deferred;
  if (!event) return "unavailable";
  deferred = null;
  emit();
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === "accepted") { installedEvent = true; emit(); }
  return outcome;
}
