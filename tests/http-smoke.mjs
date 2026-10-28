import assert from "node:assert/strict";

const origin = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";

async function request(path, expectedStatus) {
  const response = await fetch(new URL(path, origin), { redirect: "manual" });
  assert.equal(response.status, expectedStatus, `${path} returned HTTP ${response.status}`);
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 45; attempt++) {
    try {
      const response = await fetch(origin, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // The server can take a few seconds to bind its port.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Server at ${origin} did not become ready`);
}

await waitUntilReady();
await request("/", 200);
await request("/login", 200);
await request("/academics", 200);
await request("/notices", 200);
await request("/api/health", 200);
await request("/api/dashboard", 401);
await request("/api/announcements", 401);
await request("/api/guardians", 401);

process.stdout.write("Public pages and unauthenticated access smoke checks passed.\n");
