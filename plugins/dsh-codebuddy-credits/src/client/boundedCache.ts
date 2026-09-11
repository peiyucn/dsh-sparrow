/**
 * 有界 Map（客户端纯逻辑，不依赖 React / DOM / 官方包——单测直接 import）。
 * 用于「按会话累积」的展示缓存：切过的会话数可无限增长，必须有上限
 * （根 AGENTS 审计「缓存/集合与按会话累积的状态有界」条目）。
 */

/**
 * 有界写入：重复键先删后插（刷新到最新位置），超出上限按 FIFO 淘汰最老条目。
 * @param map - 目标 Map（原地修改）。
 * @param key - 键。
 * @param value - 值。
 * @param max - 条目上限。
 */
export function boundedSet<K, V>(map: Map<K, V>, key: K, value: V, max: number): void {
  map.delete(key)
  map.set(key, value)
  while (map.size > max) {
    const oldest = map.keys().next().value as K | undefined
    if (oldest === undefined) break
    map.delete(oldest)
  }
}
