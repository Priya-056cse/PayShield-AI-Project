/** Return whether a PayPal invoice can be cancelled without affecting a payment. */
export function isEligibleForInvoiceCancellation(status: string, paidAmount: number): boolean {
  return status.trim().toUpperCase() === "SENT" && Number.isFinite(paidAmount) && paidAmount === 0;
}
