import { requireBridgeGuardsAsync } from '../../../../lib/security/guard.mjs';
import { requireBridgeGuards } from '../../../../lib/security/guard.mjs';
export async function POST(req){
  const { owner, repo, prNumber, allow } = await req.json();
  // Placeholder: would call GitHub merge if policies pass
  return new Response(JSON.stringify({ ok:true, attempt: !!allow }), { status:200 });
}
