// El motor puro vive en @velora/contracts para compartirlo con el móvil.
export { decideResult, decideTransportError, mirrorChanges, pushOutbox, resolveConflict, retryPatch } from "@velora/contracts";
export type { ConflictResolution, OutboxStore, PushSummary, ResultDecision, SyncTransport } from "@velora/contracts";
