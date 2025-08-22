// lib/routes/deploy.api.mjs
import { pick } from '../providers/router.mjs';
export async function postDeploy({ provider, repo, framework, fetchImpl }){
  const a = pick(provider);
  const { id } = await a.deploy({ repo, framework, fetchImpl });
  return { ok:true, id };
}
export async function getDeployStatus({ provider, id, fetchImpl }){
  const a = pick(provider);
  const r = await a.status({ id, fetchImpl });
  return { ok:true, state: r.state, ready: r.ready };
}
export async function getPreviewUrl({ provider, id, fetchImpl }){
  const a = pick(provider);
  const { url } = await a.previewUrl({ id, fetchImpl });
  return { ok:true, url };
}
