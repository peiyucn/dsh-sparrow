/**
 * 外部链接白名单。
 *
 * 只放行 **固定常量** URL（不来自服务端响应、不拼接用户数据）——这样点击行为
 * 不可能被远端数据改写成 `javascript:` / `data:` 之类的伪协议。与官方
 * `ui-primitives/src/WebBlock.tsx:74-81` 的 `safeHref` 同一策略：解析后只接受
 * `http:` / `https:`，解析失败即拒绝。
 *
 * 单独成文件是为了能直接单测（client 侧没有 DOM 测试环境）。
 *
 * 地址本身取自宿主侧 `constants.ts` 的 `PROFILE_URL`（该文件是纯数据、无 Node
 * 依赖，可安全打进浏览器 bundle）——**全插件只有一个域名来源**，避免别名漂移。
 */

export { PROFILE_URL } from '../constants.js'

/**
 * 校验一个 URL 是否可用于 `<a href>`。
 *
 * @param url - 待校验的 URL。
 * @returns 原 URL（合法）或 undefined（非 http/https 或无法解析）。
 */
export function safeExternalHref(url: string): string | undefined {
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:' ? url : undefined
  } catch {
    return undefined
  }
}
