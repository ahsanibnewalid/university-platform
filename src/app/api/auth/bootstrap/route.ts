// Siddheswari College is a single-institution deployment. Initial provisioning
// is intentionally restricted to an operator running `npm run campus:bootstrap`
// on the server. There is no public HTTP endpoint for institution creation.
function disabled() {
  return Response.json(
    { error: "Institution registration is not available on this college portal." },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = disabled;
export const POST = disabled;
