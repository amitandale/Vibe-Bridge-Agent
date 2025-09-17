
import { NextResponse } from 'next/server';
import { open } from '../../../../../lib/db/client.mjs';

export async function GET(req: Request){
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId') || '';
    if (!projectId) return NextResponse.json({ ok:false, error:'MISSING_PROJECT' }, { status:400 });
    const db = open();
    const pid = String(projectId).replaceAll("'","''");
    const rows = db.all(`SELECT kid||'|'||active FROM secret WHERE project_id='${pid}' ORDER BY active DESC, created_at DESC;`);
    const kids = rows.map((r: string) => {
      const [kid, active] = String(r).split('|');
      return { kid, active: String(active) === '1' };
    });
    return NextResponse.json({ ok:true, kids });
  } catch (e:any){
    return NextResponse.json({ ok:false, error: 'INTERNAL', message: String(e?.message||e) }, { status:500 });
  }
}
