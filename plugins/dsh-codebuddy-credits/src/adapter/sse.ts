/** SSE 帧解析（纯函数）：非 data: 行、[DONE] 与无效 JSON 一律跳过，流解析不因坏帧中断。 */

/** SSE 数据行 → 可解析帧。 */
export function parseSseLine(line: string): Record<string, unknown> | undefined {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return undefined
  const data = trimmed.slice(5).trim()
  if (data.length === 0 || data === '[DONE]') return undefined
  try {
    const parsed = JSON.parse(data) as unknown
    return parsed !== null && typeof parsed === 'object'
      ? parsed as Record<string, unknown>
      : undefined
  } catch {
    return undefined
  }
}
