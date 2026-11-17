

import { requestHeaders } from '../catalog.js'
import { ACCOUNT_FETCH_TIMEOUT_MS, ACCOUNTS_URL } from '../constants.js'
import type { AccountView } from '../web.js'


export interface CodeBuddyAccount {
  userId?: string
  enterpriseId?: string
  enterpriseName?: string
  accountType?: string

  nickname?: string

  enterpriseUserName?: string
}

export interface AccountStore {
  current(): CodeBuddyAccount | undefined

  view(): AccountView

  refresh(key: string): Promise<void>

  ensure(): Promise<void>
  reset(): void
}

export interface AccountStoreOptions {
  resolveApiKey(): Promise<string>

  generation(): number
}

export function createAccountStore(options: AccountStoreOptions): AccountStore {
  let account: CodeBuddyAccount | undefined

  async function refresh(key: string): Promise<void> {
    const generation = options.generation()
    try {
      const res = await fetch(ACCOUNTS_URL, {
        headers: requestHeaders(key),

        signal: AbortSignal.timeout(ACCOUNT_FETCH_TIMEOUT_MS),
      })
      if (!res.ok) return
      const body = await res.json() as { data?: { accounts?: Array<{ uid?: string; enterpriseId?: string; enterpriseName?: string; type?: string; nickname?: string; enterpriseUserName?: string }> } }
      const first = body.data?.accounts?.[0]
      if (first === undefined) return

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

      }
    },
    reset() {
      account = undefined
    },
  }
}
