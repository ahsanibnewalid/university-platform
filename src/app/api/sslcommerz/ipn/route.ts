import { AuthenticationError, authErrorResponse } from "@/lib/auth";
import { processSslCommerzCallback } from "@/lib/sslcommerz-callback";

export async function POST(request: Request) {
  try {
    const result = await processSslCommerzCallback(request);
    return Response.json({ received: true, result });
  } catch (error) {
    const response = authErrorResponse(error);
    if (error instanceof AuthenticationError) return response;
    return response;
  }
}
