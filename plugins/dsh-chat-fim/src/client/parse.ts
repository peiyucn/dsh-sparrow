/** client half 纯逻辑：HTTP 响应解析安全默认值。 */

/** 非法 JSON 返回 null（反向代理错误页 / 半截响应都落这里）；不把 SyntaxError 原始消息透给用户。 */
export function parseJsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}
