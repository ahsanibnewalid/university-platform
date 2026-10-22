import { createHash, timingSafeEqual } from "node:crypto";

export function createSslCommerzVerifySign(
  keys: readonly string[],
  values: Readonly<Record<string, string>>,
  storePassword: string,
): string {
  const signedValues: Record<string, string> = { ...values };
  signedValues.store_passwd = createHash("md5").update(storePassword).digest("hex");
  const serialized = [...new Set([...keys, "store_passwd"])]
    .sort()
    .map((key) => `${key}=${signedValues[key] ?? ""}`)
    .join("&");
  return createHash("md5").update(serialized).digest("hex");
}

export function verifySslCommerzVerifySign(
  suppliedSign: string,
  keys: readonly string[],
  values: Readonly<Record<string, string>>,
  storePassword: string,
): boolean {
  if (!/^[a-f0-9]{32}$/i.test(suppliedSign)) return false;
  const expected = Buffer.from(createSslCommerzVerifySign(keys, values, storePassword), "hex");
  const supplied = Buffer.from(suppliedSign, "hex");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}
