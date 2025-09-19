// Central vendor config reader
// Reads env and validates. CI allows empty URLs.

const NAME_TO_URL_ENV = {
  marti: 'MARTI_URL',
  autogen: 'AUTOGEN_URL',
  llamaindex: 'LLAMAINDEX_URL',
  opendevin: 'OPENDEVIN_URL',
  openhands: 'OPENDEVIN_URL'
};

export function getVendorConfig(name) {
  if (!name) throw new Error('vendor name is required');
  const keyName = String(name).toLowerCase();
  const urlEnv = NAME_TO_URL_ENV[keyName];
  if (!urlEnv) throw new Error(`unknown vendor: ${name}`);

  const baseUrl = process.env[urlEnv] || '';
  const projectId = process.env.VENDOR_HMAC_PROJECT;
  const kid = process.env.VENDOR_HMAC_KID;
  const key = process.env.VENDOR_HMAC_KEY;

  const inCI = process?.env?.CI === 'true';

  if (!inCI) {
    if (!baseUrl) throw new Error(`${urlEnv} is required`);
    if (!projectId) throw new Error('VENDOR_HMAC_PROJECT is required');
    if (!kid) throw new Error('VENDOR_HMAC_KID is required');
    if (!key) throw new Error('VENDOR_HMAC_KEY is required');
  }

  return { baseUrl, projectId, kid, key };
}
