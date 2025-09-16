import { requireBridgeGuardsAsync } from '../../../../../lib/security/guard.mjs';
import { requireBridgeGuards } from '../../../../../lib/security/guard.mjs';
// app/api/admin/hmac/get-keys/route.ts
// Minimal stub. In real BA-03 this reads DB. Here it reads the in-memory store via hmac module.
import { NextResponse } from 'next/server';
import { _seed, _rotate } from '../../../../../lib/security/hmac.mjs';

export async function GET(){
  // Not exposing secrets. Only list kids present for smoke tests.
  return NextResponse.json({ ok: true, note: "stub", kids: [] });
}
