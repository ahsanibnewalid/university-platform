import { AuthenticationError } from "@/lib/auth";

type GatewayResponse = {
  status?: unknown;
  GatewayPageURL?: unknown;
};

export type ValidatedGatewayTransaction = {
  status?: unknown;
  tran_id?: unknown;
  val_id?: unknown;
  amount?: unknown;
  currency?: unknown;
  store_id?: unknown;
  risk_level?: unknown;
  bank_tran_id?: unknown;
  card_type?: unknown;
};

function getConfiguration() {
  const storeId = process.env.SSLCOMMERZ_STORE_ID?.trim();
  const storePassword = process.env.SSLCOMMERZ_STORE_PASSWORD;
  const mode = process.env.SSLCOMMERZ_MODE ?? "sandbox";
  const appUrl = process.env.APP_URL?.trim();
  if (!storeId || !storePassword) {
    throw new AuthenticationError("Online payments are not configured.", 503);
  }
  if (mode !== "sandbox" && mode !== "live") {
    throw new AuthenticationError("Payment provider mode is invalid.", 503);
  }
  if (!appUrl) {
    throw new AuthenticationError("The application URL is not configured for payments.", 503);
  }
  let parsedAppUrl: URL;
  try {
    parsedAppUrl = new URL(appUrl);
  } catch {
    throw new AuthenticationError("The application URL is invalid for payments.", 503);
  }
  if (
    !["http:", "https:"].includes(parsedAppUrl.protocol) ||
    (mode === "live" && parsedAppUrl.protocol !== "https:")
  ) {
    throw new AuthenticationError("Payments require a valid HTTPS application URL.", 503);
  }
  return {
    storeId,
    storePassword,
    appUrl: parsedAppUrl.origin,
    baseUrl:
      mode === "live"
        ? "https://securepay.sslcommerz.com"
        : "https://sandbox.sslcommerz.com",
  };
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new AuthenticationError("Payment provider is temporarily unavailable.", 502);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new AuthenticationError("Payment provider returned an invalid response.", 502);
  }
}

export async function createSslCommerzSession(input: {
  transactionId: string;
  amount: string;
  currency: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  customerCity: string;
  customerPostcode: string;
  customerCountry: string;
}) {
  const config = getConfiguration();
  const form = new URLSearchParams({
    store_id: config.storeId,
    store_passwd: config.storePassword,
    total_amount: input.amount,
    currency: input.currency,
    tran_id: input.transactionId,
    success_url: `${config.appUrl}/api/sslcommerz/success`,
    fail_url: `${config.appUrl}/api/sslcommerz/fail`,
    cancel_url: `${config.appUrl}/api/sslcommerz/cancel`,
    ipn_url: `${config.appUrl}/api/sslcommerz/ipn`,
    shipping_method: "NO",
    product_name: `University invoice ${input.invoiceNumber}`,
    product_category: "Education",
    product_profile: "general",
    cus_name: input.customerName.slice(0, 100),
    cus_email: input.customerEmail.slice(0, 100),
    cus_add1: input.customerAddress.slice(0, 100),
    cus_city: input.customerCity.slice(0, 50),
    cus_postcode: input.customerPostcode.slice(0, 20),
    cus_country: input.customerCountry.slice(0, 50),
    cus_phone: input.customerPhone.slice(0, 20),
    value_a: input.invoiceNumber,
  });
  const response = await fetch(`${config.baseUrl}/gwprocess/v4/api.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  const result = await readJsonResponse<GatewayResponse>(response);
  if (result.status !== "SUCCESS" || typeof result.GatewayPageURL !== "string") {
    throw new AuthenticationError("Payment provider could not start checkout.", 502);
  }
  let paymentUrl: URL;
  try {
    paymentUrl = new URL(result.GatewayPageURL);
  } catch {
    throw new AuthenticationError("Payment provider returned an invalid checkout URL.", 502);
  }
  if (
    paymentUrl.protocol !== "https:" ||
    paymentUrl.hostname !== new URL(config.baseUrl).hostname
  ) {
    throw new AuthenticationError("Payment provider returned an untrusted checkout URL.", 502);
  }
  return paymentUrl.toString();
}

export async function validateSslCommerzTransaction(validationId: string) {
  const config = getConfiguration();
  const query = new URLSearchParams({
    val_id: validationId,
    store_id: config.storeId,
    store_passwd: config.storePassword,
    format: "json",
  });
  const response = await fetch(
    `${config.baseUrl}/validator/api/validationserverAPI.php?${query.toString()}`,
    { method: "GET", signal: AbortSignal.timeout(15000), cache: "no-store" },
  );
  const result = await readJsonResponse<ValidatedGatewayTransaction>(response);
  if (String(result.store_id ?? "") !== config.storeId) {
    throw new AuthenticationError("Payment provider validation did not match this merchant.", 400);
  }
  return result;
}

export function getPaymentReturnUrl(outcome: string) {
  const { appUrl } = getConfiguration();
  const url = new URL("/dashboard", appUrl);
  url.searchParams.set("module", "Fees");
  url.searchParams.set("payment", outcome);
  return url;
}
