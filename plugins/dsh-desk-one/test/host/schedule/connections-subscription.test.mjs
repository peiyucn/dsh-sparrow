// @ts-check
/**
 * Generic ICS subscriptions (provider-agnostic channel).
 *
 * Regression this guards: the subscription channel reused the Outlook published-link host
 * whitelist, so every non-Microsoft public feed was rejected even though the product promises
 * "any public ICS link".
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ScheduleConnections } from '../../../lib/host/schedule/connections.js'
import { ScheduleError } from '../../../lib/host/schedule/types.js'

const ICS = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR'
const STAMP = '2026-01-01T00:00:00.000Z'

/** Empty schedule state; the connection layer only passes it through. */
const emptyState = () => ({ sources: [], calendars: [], counts: {} })

/** Credentials seam stub recording every write. */
function fakeCredentials() {
  /** @type {Array<{ ref: string, value: string }>} */
  const sets = []
  /** @type {string[]} */
  const unsets = []
  return {
    sets,
    unsets,
    service: {
      /** @param {string} ref */
      resolve: async (ref) => undefined,
      /** @param {string} ref @param {string} value */
      set: async (ref, value) => { sets.push({ ref, value }) },
      /** @param {string} ref */
      unset: async (ref) => { unsets.push(ref) },
    },
  }
}

/** Connection layer + stubbed store / context / facade seams. */
function harness(credentials) {
  /** @type {any[]} */
  const created = []
  const store = {
    /** @param {any} input */
    createScheduleSource: async (input) => {
      const record = {
        id: `source_${created.length + 1}`,
        kind: 'schedule-source',
        schema: 1,
        provider: 'ics',
        channel: 'ics',
        account: input.account,
        credentialRef: input.credentialRef,
        enabled: true,
        syncState: 'idle',
        createdAt: STAMP,
        updatedAt: STAMP,
        revision: 1,
      }
      created.push(record)
      return record
    },
  }
  const ctx = {
    /** @param {string} name */
    get: (name) => (name === 'credentials' ? credentials.service : undefined),
    logger: { warn: () => {} },
  }
  const deps = {
    syncSource: async () => ({ provider: 'ics', channel: 'ics', ok: true, calendars: 1, events: 0 }),
    state: emptyState,
    clearGraphAccess: () => {},
  }
  return {
    created,
    connections: new ScheduleConnections(/** @type {any} */ (ctx), /** @type {any} */ (store), deps),
  }
}

/** Run one test body with the global fetch replaced, restoring it afterwards. */
async function withFetch(impl, run) {
  const original = globalThis.fetch
  globalThis.fetch = /** @type {any} */ (impl)
  try {
    return await run()
  } finally {
    globalThis.fetch = original
  }
}

describe('通用 ICS 订阅（provider 无关）', () => {
  it('应该接受非 Outlook 的公网 https 链接，并把链接存进凭据库', async () => {
    const credentials = fakeCredentials()
    const { created, connections } = harness(credentials)
    const url = 'https://calendar.google.com/calendar/ical/example/basic.ics'
    const result = await withFetch(
      async () => new Response(ICS, { status: 200, headers: { 'content-type': 'text/calendar' } }),
      () => connections.addSubscription({ url, name: '团队日历' }),
    )
    assert.deepEqual(result, emptyState())
    assert.equal(created.length, 1, '订阅应该落成一条 source 记录')
    assert.equal(created[0]?.account, '团队日历')
    assert.deepEqual(credentials.sets.map(entry => entry.value), [url], '订阅链接应存进凭据库')
    assert.equal(created[0]?.credentialRef, credentials.sets[0]?.ref, 'source 只存凭据引用名')
  })

  it('应该拒绝内网 / 回环链接，且不保存任何凭据或记录', async () => {
    const credentials = fakeCredentials()
    const { created, connections } = harness(credentials)
    let fetched = 0
    await withFetch(async () => {
      fetched += 1
      throw new Error('must not be called')
    }, async () => {
      for (const url of [
        'http://127.0.0.1:3080/api/desk-one/notes',
        'https://192.168.1.10/calendar.ics',
        'https://localhost/calendar.ics',
      ]) {
        await assert.rejects(
          () => connections.addSubscription({ url }),
          (error) => error instanceof ScheduleError && error.kind === 'UNSUPPORTED',
          url,
        )
      }
    })
    assert.equal(fetched, 0, '内网链接不得发起请求')
    assert.equal(created.length, 0)
    assert.equal(credentials.sets.length, 0)
  })
})
