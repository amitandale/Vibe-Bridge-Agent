// app/api/helpers/wrapWrite.mjs
import { requireHmac } from '../../../lib/security/hmac.mjs';
export function wrapWrite(handler){
  return async (req) => {
    if (process.env.HMAC_ENFORCE === '1'){
      const mw = requireHmac();
      const res = { setHeader(){}, end(){}, statusCode: 0 };
      await mw(req, res);
      if (res.statusCode && res.statusCode >= 400){
        const body = JSON.stringify({ error:{ code:'FORBIDDEN' } });
        return new Response(body, { status: res.statusCode });
      }
    }
    return handler(req);
  };
}
