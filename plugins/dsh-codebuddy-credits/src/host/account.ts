/**
 * /v2/accounts 账号快照：企业上下文头（适配器请求）与额度面板用户徽章共用，只存进程内。
 * 每次补拉都捕获凭据代际，落定前代际变化即丢弃——换 Key / 清 Key 后旧快照不得覆盖新状态。
 */

import { requestHeaders } from '../catalog.js'
import { ACCOUNT_FETCH_TIMEOUT_MS, ACCOUNTS_URL } from '../constants.js'
import type { AccountView } from '../web.js'

/** /v2/accounts 的账号快照（企业上下文头用，与官方 CLI 一致）。 */
export interface CodeBuddyAccount {
  userId?: string
  enterpriseId?: string
  enterpriseName?: string
  accountType?: string
  /** 账号昵称（/v2/accounts 的 nickname）。 */
  nickname?: string
  /** 企业内姓名（/v2/accounts 的 enterpriseUserName）。 */
  enterpriseUserName?: string
}

export interface AccountStore {
  current(): CodeBuddyAccount | undefined
  /** 供 /status 与 /refresh-models 的展示字段（不泄露 uid / enterpriseId）。 */
  view(): AccountView
  /** best-effort 补拉：失败 / 非 2xx / 空列表都保持现状，不阻塞注册与状态读取。 */
  refresh(key: string): Promise<void>
  /** 启动期补拉失败的兜底：账号仍缺时用当前 Key 再试一次（失败静默）。 */
  ensure(): Promise<void>
  reset(): void
}

export interface AccountStoreOptions {
  resolveApiKey(): Promise<string>
  /** 凭据/授权代际（saveKey / reapply / removeKey 落定前自增）。 */
  generation(): number
}

export function createAccountStore(options: AccountStoreOptions): AccountStore {
  let account: CodeBuddyAccount | undefined

  async function refresh(key: string): Promise<void> {
    const generation = options.generation()
    try {
      const res = await fetch(ACCOUNTS_URL, {
        headers: requestHeaders(key),
        // /status 会触发补拉：加超时避免把状态接口挂住。
        signal: AbortSignal.timeout(ACCOUNT_FETCH_TIMEOUT_MS),
      })
      if (!res.ok) return
      const body = await res.json() as { data?: { accounts?: Array<{ uid?: string; enterpriseId?: string; enterpriseName?: string; type?: string; nickname?: string; enterpriseUserName?: string }> } }
      const first = body.data?.accounts?.[0]
      if (first === undefined) return
      // 凭据代际已变化（换/清 Key）：旧账号快照不覆盖新状态。
      if (generation !== options.generation()) return
      account = {
        ...(first.uid === undefined ? {} : { userId: first.uid }),
        ...(first.enterpriseId === undefined ? {} : { enterpriseId: first.enterpriseId }),
        ...(first.enterpriseName === undefined ? {} : { enterpriseName: first.enterpriseName }),
        ...(first.type === undefined ? {} : { accountType: first.type }),
        ...(first.nickname === undefined ? {} : { nickname: first.nickname }),
        ...(first.enterpriseUserName === undefined ? {} : { enterpriseUserName: first.enterpriseUserName }),
      }
    } catch {
      // 账号信息缺失只影响企业上下文头，不阻塞功能。
    }
  }

  return {
    current: () => account,
    view: () => ({
      ...(account?.enterpriseName === undefined ? {} : { enterpriseName: account.enterpriseName }),
      ...(account?.accountType === undefined ? {} : { accountType: account.accountType }),
      ...(account?.enterpriseUserName === undefined ? {} : { enterpriseUserName: account.enterpriseUserName }),
      ...(account?.nickname === undefined ? {} : { nickname: account.nickname }),
    }),
    refresh,
    async ensure() {
      if (account !== undefined) return
      try {
        await refresh(await options.resolveApiKey())
      } catch {
        // best-effort：账号信息缺失不阻塞状态接口。
      }
    },
    reset() {
      account = undefined
    },
  }
}
