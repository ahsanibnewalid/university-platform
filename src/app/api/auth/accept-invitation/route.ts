// Generic invitation signup is retired. Students activate college-issued IDs;
// staff verify an email address that the college has already approved.
export async function GET() {
  return Response.json({ error: "Invitation signup has been retired. Use college registration." }, { status: 410 });
}

export async function POST() {
  return Response.json({ error: "Invitation signup has been retired. Use college registration." }, { status: 410 });
}
