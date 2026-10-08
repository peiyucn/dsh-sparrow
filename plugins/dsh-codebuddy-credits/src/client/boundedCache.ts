/** 有界 Map：客户端纯逻辑，不依赖 React / DOM / 官方包（单测直接 import），按会话累积的缓存必须有上限。 */

/** 重复键刷新到最新位置，超出上限按 FIFO 淘汰最老条目。 */
export function boundedSet<K, V>(map: Map<K, V>, key: K, value: V, max: number): void {
  map.delete(key)
  map.set(key, value)
  while (map.size > max) {
    const oldest = map.keys().next().value as K | undefined
    if (oldest === undefined) break
    map.delete(oldest)
  }
}
