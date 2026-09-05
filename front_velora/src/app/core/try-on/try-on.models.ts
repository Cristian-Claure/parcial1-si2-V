export type TryOnJobStatus =
  | 'QUEUED'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED';

export type TryOnProvider =
  | 'LOCAL'
  | 'REPLICATE';

export interface TryOnJob {
  id: string;
  productId?: string;
  variantId?: string | null;
  garmentImageId?: string;
  provider?: TryOnProvider;
  externalJobId?: string | null;
  status: TryOnJobStatus;
  resultStorageKey?: string | null;
  resultContentType?: string | null;
  resultSizeBytes?: number | null;
  errorMessage?: string | null;
  durationMs?: number | null;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
}

export interface CreateTryOnJobPayload {
  productId: string;
  variantId?: string | null;
  person: File;
}
