/**
 * 宿主会话格式的常量探针（**host 专用**）。
 * 单独成文件而不是放进 compat.ts：官方 `@deepseek-ai/dsh-session` 带 Node 内建依赖，而 compat.ts 是 client half
 * 也要 import 的纯逻辑模块 —— 混在一起会把 Node 模块拖进浏览器 bundle。
 */

import * as dshSessionSurface from '@deepseek-ai/dsh-session'

/** 用**命名空间访问**而非具名导入：官方若删除/改名该导出，这里只得到 `undefined`（判为不支持 → 自停用），而不是 ESM 链接期失败——链接期失败不在插件容器对 `apply` 的异常保护范围内。 */
export function hostSessionFormatVersion(): unknown {
  return (dshSessionSurface as { readonly SESSION_FORMAT_VERSION?: unknown }).SESSION_FORMAT_VERSION
}
