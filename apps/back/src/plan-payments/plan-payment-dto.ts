import type { TransferProof } from "@velora/contracts";
import type { PaymentRow, PaymentTransferProofRow } from "@velora/database";

export function toProofDto(proof: PaymentTransferProofRow): TransferProof {
  return {
    id: proof.id, operationNumber: proof.operationNumber, contentType: proof.contentType, sizeBytes: proof.sizeBytes, submittedAt: proof.submittedAt.toISOString(),
    decision: proof.decision, reviewedAt: proof.reviewedAt?.toISOString() ?? null, rejectionReason: proof.rejectionReason,
  };
}

export function methodLabel(payment: Pick<PaymentRow, "method" | "provider">): string {
  if (payment.method === "QR") return payment.provider === "QR_DEMO" ? "QR (demostración)" : "QR";
  if (payment.method === "TRANSFER") return "Transferencia bancaria";
  if (payment.provider === "STRIPE") return "Tarjeta (Stripe)";
  return "Tarjeta DEMO";
}
