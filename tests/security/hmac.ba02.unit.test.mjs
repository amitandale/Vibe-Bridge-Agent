// tests/security/hmac.ba02.unit.test.mjs
// Unit tests for PR-BA-02 Overlay 1: lib/security/hmac.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeHmacHex, parseSignatureHeader, buildVerifier, DEFAULT_GRACE_S, constantTimeEqualHex, sign } from '../../lib/security/hmac.mjs'

function mkSecrets(records) {
  return async (projectId) => records.filter(r => r.project_id === projectId);
}

// Helpers
const nowS = Math.floor(Date.now() / 1000);

test('contract: x-signature format and length', () => {
  assert.throws(() => parseSignatureHeader('sha1=aaaa'), { message: 'BAD_SIGNATURE_FORMAT' })
  assert.throws(() => parseSignatureHeader('sha256='), { message: 'BAD_SIGNATURE_FORMAT' })
  const { alg, hex } = parseSignatureHeader('sha256=abCD');
  assert.equal(alg, 'sha256')
  assert.equal(hex, 'abcd')
})

test('constantTimeEqualHex basic behavior', () => {
  assert.equal(constantTimeEqualHex('00', '00'), true)
  assert.equal(constantTimeEqualHex('00', 'ff'), false)
  assert.equal(constantTimeEqualHex('0', '00'), false)
  assert.equal(constantTimeEqualHex('zz', '00'), false)
})

test('verify ok with current key', async () => {
  const projectId = 'p1'
  const curr = { kid: 'k2', project_id: projectId, value: 'sekret2', created_at: nowS - 10, rotated_at: null, active: 1 }
  const prev = { kid: 'k1', project_id: projectId, value: 'sekret1', created_at: nowS - 100, rotated_at: nowS - 10, active: 1 }
  const v = buildVerifier({ getActiveSecretsByProject: mkSecrets([prev, curr]) })
  const body = Buffer.from('hello', 'utf8')
  const sig = 'sha256=' + computeHmacHex(curr.value, body)
  await v.verify({ projectId, kid: curr.kid, signatureHeader: sig, rawBody: body, nowS })
})

test('verify ok with previous key within grace', async () => {
  const projectId = 'p2'
  const curr = { kid: 'kB', project_id: projectId, value: 'BBB', created_at: nowS - 5, rotated_at: null, active: 1 }
  const prev = { kid: 'kA', project_id: projectId, value: 'AAA', created_at: nowS - 1000, rotated_at: nowS - 5, active: 1 }
  const v = buildVerifier({ getActiveSecretsByProject: mkSecrets([prev, curr]) })
  const body = Buffer.from('payload', 'utf8')
  const sig = 'sha256=' + computeHmacHex(prev.value, body)
  await v.verify({ projectId, kid: prev.kid, signatureHeader: sig, rawBody: body, nowS })
})

test('verify rejects previous key outside grace', async () => {
  const projectId = 'p3'
  const curr = { kid: 'KCUR', project_id: projectId, value: 'CUR', created_at: nowS - 5, rotated_at: null, active: 1 }
  const prev = { kid: 'KPREV', project_id: projectId, value: 'PREV', created_at: nowS - (DEFAULT_GRACE_S + 1000), rotated_at: nowS - (DEFAULT_GRACE_S + 10), active: 1 }
  const v = buildVerifier({ getActiveSecretsByProject: mkSecrets([prev, curr]) })
  const body = Buffer.from([0xde, 0xad, 0xbe, 0xef]) // non-UTF8 safe
  const sig = 'sha256=' + computeHmacHex(prev.value, body)
  await assert.rejects(
    () => v.verify({ projectId, kid: prev.kid, signatureHeader: sig, rawBody: body, nowS }),
    (err) => err?.status === 403 && /OUTSIDE_GRACE_WINDOW|BAD_SIGNATURE/.test(err.message)
  )
})

test('verify rejects when no active keys', async () => {
  const projectId = 'p4'
  const v = buildVerifier({ getActiveSecretsByProject: mkSecrets([]) })
  await assert.rejects(
    () => v.verify({ projectId, kid: 'x', signatureHeader: 'sha256=00', rawBody: '', nowS }),
    (err) => err?.status === 401 && /NO_ACTIVE_KEY_FOR_PROJECT/.test(err.message)
  )
})

test('verify rejects tampered body', async () => {
  const projectId = 'p5'
  const curr = { kid: 'kid', project_id: projectId, value: 'key', created_at: nowS - 1, rotated_at: null, active: 1 }
  const v = buildVerifier({ getActiveSecretsByProject: mkSecrets([curr]) })
  const body = Buffer.from('abc')
  const sig = 'sha256=' + computeHmacHex(curr.value, body)
  await assert.rejects(
    () => v.verify({ projectId, kid: curr.kid, signatureHeader: sig, rawBody: Buffer.from('abcd'), nowS }),
    (err) => err?.status === 403 && /BAD_SIGNATURE/.test(err.message)
  )
})


test('sign() returns sha256=<hex> header and matches computeHmacHex', () => {
  const body = Buffer.from('xyz')
  const sec = 'k'
  const hdr = sign(sec, body)
  const { alg, hex } = parseSignatureHeader(hdr)
  assert.equal(alg, 'sha256')
  assert.equal(hex, computeHmacHex(sec, body))
})
