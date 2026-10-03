import { AuthenticationError } from "@/lib/auth";
import { verifyAndSettleSslCommerzPayment } from "@/lib/sslcommerz-settlement";

function formValue(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function readSslCommerzCallback(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new AuthenticationError("Payment provider callback is invalid.", 400);
  }
  const transactionId = formValue(form, "tran_id");
  const validationId = formValue(form, "val_id");
  if (!/^[A-Za-z0-9_-]{1,30}$/.test(transactionId)) {
    throw new AuthenticationError("Payment provider callback is missing a valid transaction ID.", 400);
  }
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(validationId)) {
    return { transactionId, validationId: null };
  }
  return { transactionId, validationId };
}

export async function processSslCommerzCallback(request: Request) {
  const { transactionId, validationId } = await readSslCommerzCallback(request);
  if (!validationId) return "pending" as const;
  return verifyAndSettleSslCommerzPayment(transactionId, validationId);
}
