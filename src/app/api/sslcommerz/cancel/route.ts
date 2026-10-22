import { authErrorResponse } from "@/lib/auth";
import { releaseSslCommerzCheckout } from "@/lib/sslcommerz-callback";
import { getPaymentReturnUrl } from "@/lib/sslcommerz";

export async function POST(request: Request) {
  try {
    await releaseSslCommerzCheckout(request, "CANCELLED_RETURN");
    return Response.redirect(getPaymentReturnUrl("cancelled").toString(), 303);
  } catch (error) {
    try {
      return Response.redirect(getPaymentReturnUrl("unverified").toString(), 303);
    } catch {
      return authErrorResponse(error);
    }
  }
}
