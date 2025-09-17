import { requireBridgeGuardsAsync } from '../../../../../lib/security/guard.mjs';
import { requireBridgeGuards } from '../../../../../lib/security/guard.mjs';
// app/api/admin/hmac/put-rotate/route.ts
// Minimal stub for rotation. For BA-03 this would validate admin ticket and write to DB.
import { NextResponse } from 'next/server';
import { _rotate } from '../../../../../lib/security/hmac.mjs';

export async function PUT(){
  return NextResponse.json({ ok: true, note: "stub" });
}
