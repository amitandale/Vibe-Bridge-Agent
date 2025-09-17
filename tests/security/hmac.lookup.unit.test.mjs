// tests/security/hmac.lookup.unit.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lookupKey } from '../../lib/security/hmac.mjs'

test('lookupKey finds active key by kid', async () => {
  const projectId = 'pL'
  const recs = [
    { kid: 'a', project_id: projectId, value: 'A', created_at: 1, rotated_at: null, active: 1 },
    { kid: 'b', project_id: projectId, value: 'B', created_at: 2, rotated_at: null, active: 0 },
  ]
  const getActiveSecretsByProject = async (p) => p === projectId ? recs : []
  const r = await lookupKey({ projectId, kid: 'a', getActiveSecretsByProject })
  assert.equal(r?.value, 'A')
  const none = await lookupKey({ projectId, kid: 'b', getActiveSecretsByProject })
  assert.equal(none, null)
})
