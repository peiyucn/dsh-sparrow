/** client half 纯逻辑：HTTP 响应解析安全默认值。 */

/**
 * 安全解析 JSON 文本：非法 JSON 返回 null，调用方按场景给安全默认值
 * （fail-open）或可读错误——不把 SyntaxError 的原始消息透给用户
 * （反向代理错误页 / 半截响应都落这里）。
 */
export function parseJsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}
