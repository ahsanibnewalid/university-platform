import { Resend } from "resend";
import { AuthenticationError } from "@/lib/auth";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function configuredMailService() {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    throw new AuthenticationError(
      "Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM.",
      503,
    );
  }
  return { client: new Resend(key), from };
}

function publicApplicationUrl() {
  const configuredUrl = process.env.APP_URL;
  if (!configuredUrl) {
    throw new AuthenticationError("APP_URL must be configured before sending account email.", 503);
  }
  let url: URL;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new AuthenticationError("APP_URL must be a valid absolute URL.", 503);
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new AuthenticationError("APP_URL must use HTTPS in production.", 503);
  }
  return url.origin;
}

export async function sendAccountEmail(
  recipient: string,
  subject: string,
  heading: string,
  description: string,
  actionLabel: string,
  actionUrl: string,
) {
  const { client, from } = configuredMailService();
  const origin = publicApplicationUrl();
  if (!actionUrl.startsWith(`${origin}/`)) {
    throw new AuthenticationError("Account action URL must belong to this application.", 500);
  }
  const safeHeading = escapeHtml(heading);
  const safeDescription = escapeHtml(description);
  const safeLabel = escapeHtml(actionLabel);
  const safeUrl = escapeHtml(actionUrl);
  const { error } = await client.emails.send({
    from,
    to: recipient,
    subject,
    text: `${heading}\n\n${description}\n\n${actionLabel}: ${actionUrl}\n\nIf you did not request this, ignore this email.`,
    html: `<main style="font-family:Arial,sans-serif;max-width:520px;margin:32px auto;padding:24px;border:1px solid #e7ece6;border-radius:12px;color:#263329"><h1 style="font-size:22px">${safeHeading}</h1><p style="line-height:1.6;color:#59635b">${safeDescription}</p><a href="${safeUrl}" style="display:inline-block;margin-top:12px;padding:11px 16px;border-radius:7px;background:#397f5b;color:white;text-decoration:none">${safeLabel}</a><p style="margin-top:24px;font-size:12px;color:#788079">If you did not request this, you can ignore this email.</p></main>`,
  });
  if (error) {
    throw new Error(`Email delivery failed: ${error.message}`);
  }
}
