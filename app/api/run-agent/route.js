
export const runtime = 'nodejs';
export async function POST(req){
  try{
    const raw = await req.text();
    const data = raw ? JSON.parse(raw) : {};
    return new Response(JSON.stringify({
      ok:true,
      receivedMode:data?.mode||'unknown',
      echo:data,
      prUrl:'https://example.com/pr/123',
      message:'Stub bridge: integrate GitHub & CI next.'
    }), { status:200, headers:{'content-type':'application/json'} });
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status:400, headers:{'content-type':'application/json'} });
  }
}
