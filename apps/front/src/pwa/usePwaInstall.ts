import { useEffect, useSyncExternalStore } from "react";
import { getPwaInstallSnapshot, promptPwaInstall, startPwaInstallCapture, subscribePwaInstall, type InstallOutcome } from "./pwaInstall";

export interface PwaInstall {
  canInstall: boolean;
  isInstalled: boolean;
  needsIosSteps: boolean;
  install: () => Promise<InstallOutcome>;
}

export function usePwaInstall(): PwaInstall {
  useEffect(() => { if (typeof window !== "undefined") startPwaInstallCapture(window); }, []);
  const state = useSyncExternalStore(subscribePwaInstall, getPwaInstallSnapshot, getPwaInstallSnapshot);
  return { ...state, install: promptPwaInstall };
}
