/**
 * pi-ai 认证模型与 DSH 凭据平面的桥接（与官方 llm-pi-ai/src/auth.ts 同构）。
 * 官方未导出 credentialStoreFrom/authContextFrom，此处按同一实现自建；
 * 记录作用域为插件自己的命名空间，避免读到其他适配器家族的凭据格式。
 */

import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve as resolvePath } from 'node:path'
import type { AuthContext, Credential, CredentialInfo, CredentialStore } from '@earendil-works/pi-ai'
import type { Context } from '@deepseek-ai/cordis'
import {
  credentialKey,
  credentialKeyId,
  credentialKeyScope,
  credentialRef,
  isCredentialKeySegment,
  isCredentialRefName,
} from '@deepseek-ai/dsh-credentials'
import type { CredentialKey, CredentialProvider, CredentialRecord } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { NS } from './constants.js'

/** 凭据记录作用域：本插件在 DSH 凭据服务里写入的记录都挂在这里。 */
export const RECORD_SCOPE = NS

/** 本插件记录一个 provider id 的凭据地址。 */
export function recordKeyFor(providerId: string): CredentialKey {
  return credentialKey(RECORD_SCOPE, providerId)
}

/** 存储记录 → pi-ai 凭据。api-key 记录逐字段重建；grant 载荷按不透明 JSON 直通。 */
function toPiCredential(record: CredentialRecord | undefined): Credential | undefined {
  if (record === undefined) return undefined
  if (record.kind === 'api-key') {
    return {
      type: 'api_key',
      ...record.key === undefined ? {} : { key: record.key },
      ...record.env === undefined ? {} : { env: { ...record.env } },
    }
  }
  return record.payload as Credential
}

/** pi-ai 凭据 → 存储记录。 */
function toRecord(credential: Credential): CredentialRecord {
  if (credential.type === 'api_key') {
    return {
      kind: 'api-key',
      ...credential.key === undefined ? {} : { key: credential.key },
      ...credential.env === undefined ? {} : { env: { ...credential.env } },
    }
  }
  const payload = JSON.parse(JSON.stringify(credential)) as unknown
  return { kind: 'grant', payload }
}

/** 可写的凭据服务；缺服务时写操作 fail loud，读操作回答「无存储」。 */
function writableStore(ctx: Context): CredentialProvider {
  const credentials = ctx.get('credentials')
  if (credentials === undefined) {
    throw new LlmError(
      'llm-codebuddy-credits: this composition mounts no credentials service, so there is nowhere to'
      + ' store the credential a sign-in produces; mount one (dsh-credentials-local) to sign in',
      'NO_CREDENTIAL_STORE',
    )
  }
  return credentials
}

/** pi-ai CredentialStore 实现（读/列/改/删全部落在 DSH 凭据记录上）。 */
export function credentialStoreFrom(ctx: Context): CredentialStore {
  return {
    async read(providerId) {
      const credentials = ctx.get('credentials')
      if (credentials === undefined) return undefined
      if (!isCredentialKeySegment(providerId)) return undefined
      return toPiCredential(await credentials.readRecord(recordKeyFor(providerId)))
    },
    async list(): Promise<readonly CredentialInfo[]> {
      const stored = await ctx.get('credentials')?.listRecords() ?? []
      const mine: CredentialInfo[] = []
      for (const entry of stored) {
        if (credentialKeyScope(entry.key) !== RECORD_SCOPE) continue
        mine.push({
          providerId: credentialKeyId(entry.key),
          type: entry.kind === 'api-key' ? 'api_key' : 'oauth',
        })
      }
      return mine
    },
    async modify(providerId, mutate) {
      if (!isCredentialKeySegment(providerId)) {
        throw new LlmError(
          `llm-codebuddy-credits: provider id "${providerId}" cannot address a stored credential record`
          + ' (a record id is a lowercase hyphenated identifier); authenticate this route through'
          + ' apiKeyEnv instead of a stored credential',
          'UNSTORABLE_PROVIDER_ID',
        )
      }
      const stored = await writableStore(ctx).modifyRecord(recordKeyFor(providerId), async (current) => {
        const next = await mutate(toPiCredential(current))
        return next === undefined ? undefined : toRecord(next)
      })
      return toPiCredential(stored)
    },
    async delete(providerId) {
      if (!isCredentialKeySegment(providerId)) return
      await writableStore(ctx).deleteRecord(recordKeyFor(providerId))
    },
  }
}

/** pi-ai AuthContext 实现（凭据缝优先，回退进程环境与宿主机文件系统）。 */
export function authContextFrom(ctx: Context): AuthContext {
  return {
    async env(name) {
      if (isCredentialRefName(name)) {
        const credentials = ctx.get('credentials')
        const hit = await credentials?.resolve(credentialRef(name))
        if (hit !== undefined) return hit.value
      }
      return launchEnvironmentOf(ctx).get(name)?.value
    },
    async fileExists(path) {
      const expanded = path.startsWith('~/') || path === '~'
        ? resolvePath(homedir(), path.slice(1).replace(/^\//, ''))
        : path
      try {
        await access(expanded)
        return true
      } catch {
        return false
      }
    },
  }
}

/** PiAiAdapter 需要的认证注入对（credentials 存储 + 环境上下文）。 */
export function authInjectionFor(ctx: Context): { credentials: CredentialStore; authContext: AuthContext } {
  return { credentials: credentialStoreFrom(ctx), authContext: authContextFrom(ctx) }
}
