
import { NextResponse } from 'next/server';
import { open } from '../../../../../lib/db/client.mjs';

export async function PUT(req: Request){
  try {
    const body = await req.json().catch(() => ({}));
    const projectId = String(body.projectId||'');
    const newKid = String(body.newKid||'');
    const newKey = String(body.newKey||'');
    if (!projectId || !newKid || !newKey){
      return NextResponse.json({ ok:false, error:'MISSING_FIELDS' }, { status:400 });
    }
    const db = open();
    const pid = projectId.replaceAll("'","''");
    const kk = newKid.replaceAll("'","''");
    const kv = newKey.replaceAll("'","''");
    // Mark current active as previous
    db.exec(`UPDATE secret SET active=0, rotated_at=strftime('%s','now') WHERE project_id='${pid}' AND active=1;`);
    // Insert new active secret
    const id = 'sec_'+Math.random().toString(36).slice(2);
    db.exec(`INSERT INTO secret(id, kid, project_id, type, value, created_at, active) VALUES ('${id}', '${kk}', '${pid}', 'HMAC', '${kv}', strftime('%s','now'), 1);`);
    return NextResponse.json({ ok:true, projectId, kid:newKid });
  } catch (e:any){
    return NextResponse.json({ ok:false, error:'INTERNAL', message:String(e?.message||e) }, { status:500 });
  }
}
