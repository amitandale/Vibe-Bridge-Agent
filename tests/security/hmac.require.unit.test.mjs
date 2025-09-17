// tests/security/hmac.require.unit.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requireHmac, sign } from '../../lib/security/hmac.mjs'

test('requireHmac exists and passes valid request', async () => {
  assert.equal(typeof requireHmac, 'function')
  const projectId = 'p_req'
  const rec = { kid: 'kid1', project_id: projectId, value: 'sek', created_at: 1, rotated_at: null, active: 1 }
  const getActiveSecretsByProject = async (p) => p === projectId ? [rec] : []
  const guard = requireHmac({ getActiveSecretsByProject })
  const body = Buffer.from('abc')
  const headers = {
    'x-vibe-project': projectId,
    'x-vibe-kid': rec.kid,
    'x-signature': sign(rec.value, body),
  }
  let called = false
  await guard({ headers, rawBody: body }, null, () => { called = true })
  assert.equal(called, true)
})

test('requireHmac rejects tampered body', async () => {
  const projectId = 'p_req2'
  const rec = { kid: 'kid2', project_id: projectId, value: 'sek2', created_at: 1, rotated_at: null, active: 1 }
  const getActiveSecretsByProject = async () => [rec]
  const guard = requireHmac({ getActiveSecretsByProject })
  const body = Buffer.from('xyz')
  const headers = {
    'x-vibe-project': projectId,
    'x-vibe-kid': rec.kid,
    'x-signature': sign(rec.value, body),
  }
  await assert.rejects(() => guard({ headers, rawBody: Buffer.from('xya') }))
})
