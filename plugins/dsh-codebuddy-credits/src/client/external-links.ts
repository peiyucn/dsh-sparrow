/**
 * 外部链接白名单：只放行固定常量 URL（非服务端数据、不拼用户输入），点击目标不可能
 * 被改写成 `javascript:` / `data:`——与官方 `WebBlock.tsx` 的 `safeHref` 同策略，解析失败即拒绝。
 * 地址唯一来源是 `constants.ts` 的 `PROFILE_URL`；单独成文件便于直接单测（client 无 DOM 环境）。
 */

export { PROFILE_URL } from '../constants.js'

/** 校验一个 URL 是否可用于 `<a href>`：合法（http/https）时原样返回，否则 undefined。 */
export function safeExternalHref(url: string): string | undefined {
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:' ? url : undefined
  } catch {
    return undefined
  }
}
