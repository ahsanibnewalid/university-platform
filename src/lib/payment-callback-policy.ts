export function needsManualReconciliationAfterLateSuccess(status: string): boolean {
  return status === "FAILED" || status === "CANCELLED";
}
