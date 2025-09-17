import { NextResponse } from 'next/server';
// Example write handler. After running the injector this file will include:
// import { requireHmac } from '../../../../lib/security/guard.mjs';
// and call await requireHmac()(request);
export async function POST(request: Request) {
  // request body handling...
  const body = await request.json();
  // perform create
  return NextResponse.json({ ok: true });
}
