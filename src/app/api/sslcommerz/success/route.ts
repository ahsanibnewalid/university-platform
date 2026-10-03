import { authErrorResponse } from "@/lib/auth";
import { processSslCommerzCallback } from "@/lib/sslcommerz-callback";
import { getPaymentReturnUrl } from "@/lib/sslcommerz";

export async function POST(request: Request) {
  try {
    const result = await processSslCommerzCallback(request);
    return Response.redirect(getPaymentReturnUrl(result).toString(), 303);
  } catch (error) {
    try {
      return Response.redirect(getPaymentReturnUrl("unverified").toString(), 303);
    } catch {
      return authErrorResponse(error);
    }
  }
}
