/** 官方 dsh-llm-deepseek 的运行时面（惰性 import）。缺导出 / 构造签名不符即启动自停用。 */

import type { DeepSeekFileId, DeepSeekFilePage } from '@deepseek-ai/dsh-llm-deepseek'
import { probeFilesClientShape } from './files.js'
import { FileManageError } from './http.js'

/**
 * 不用模块顶层具名导入官方运行时常量：官方删除 / 改名导出时，具名导入会在模块加载阶段链接期失败，
 * 而链接期失败不在插件容器对 `apply` 的异常保护范围内（根 AGENTS《插件与宿主兼容》）。
 */
export interface DeepSeekSurface {
  readonly DeepSeekFileId: (value: string) => DeepSeekFileId
  /**
   * rc.2 起构造签名是 `{ baseURL, headers, fetch? }`；rc.1 的 `{ baseURL, apiKey, accountCredential? }`
   * 在 rc.2 上会被忽略并在请求时抛错 —— 见 {@link probeFilesClientShape}。
   */
  readonly DeepSeekFilesClient: new (options: {
    baseURL: string
    headers: Readonly<Record<string, string>>
    fetch?: typeof fetch
  }) => {
    list(options?: { after?: DeepSeekFileId; limit?: number; signal?: AbortSignal }): Promise<DeepSeekFilePage>
    delete(fileId: DeepSeekFileId, signal?: AbortSignal): Promise<void>
  }
  readonly MAX_STORED_FILE_BYTES: number
  readonly MAX_STORED_FILE_COUNT: number
  /** 官方公共 API 根（未配 baseURL、未设 `$DEEPSEEK_BASE_URL` 时的回退）；随官方版本变化。 */
  readonly PUBLIC_BASE_URL: string
}

let officialSurface: DeepSeekSurface | undefined

/** 读取（并缓存）官方导出面；缺任何一项即抛可读错误（启动期抛错 = 自停用）。 */
export async function deepSeekSurface(): Promise<DeepSeekSurface> {
  if (officialSurface !== undefined) return officialSurface
  const module = await import('@deepseek-ai/dsh-llm-deepseek') as unknown as Record<string, unknown>
  const missing = (['DeepSeekFileId', 'DeepSeekFilesClient', 'MAX_STORED_FILE_BYTES', 'MAX_STORED_FILE_COUNT', 'PUBLIC_BASE_URL'] as const)
    .filter(key => module[key] === undefined)
  if (missing.length > 0) {
    throw new FileManageError(
      'UNSUPPORTED_HOST',
      `当前 dsh 的 dsh-llm-deepseek 不再导出 ${missing.join('、')}；本插件已停用（升级本插件后自动恢复）`,
      501,
    )
  }
  // 形状门：符号都在、但构造参数换名（rc.1 `apiKey` → rc.2 `headers`）同样会让插件带病运行。
  if (!await probeFilesClientShape(module.DeepSeekFilesClient as never)) {
    throw new FileManageError(
      'UNSUPPORTED_HOST',
      '当前 dsh 的 DeepSeekFilesClient 不接受 headers/fetch 构造参数（rc.2 起签名）；本插件已停用（升级本插件后自动恢复）',
      501,
    )
  }
  officialSurface = module as unknown as DeepSeekSurface
  return officialSurface
}
