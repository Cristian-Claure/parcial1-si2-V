export type { MirrorRecord, OutboxEntry } from "@velora/contracts";
export { mirrorKey } from "@velora/contracts";



export interface PendingImage {
  id: string;
  companyId: string;
  userId: string;
  productId: string;
  /** Operación que crea el producto: la imagen sube cuando esa operación ya fue aplicada. */
  dependsOn: string;
  blob: Blob;
  filename: string;
  status: "WAITING" | "FAILED";
  attempts: number;
  error: string | null;
  createdAt: string;
}

export interface SyncStateRecord { companyId: string; cursor: string | null; lastPullAt: string | null }

