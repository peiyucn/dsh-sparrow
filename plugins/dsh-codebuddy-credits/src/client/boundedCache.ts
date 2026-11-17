


export function boundedSet<K, V>(map: Map<K, V>, key: K, value: V, max: number): void {
  map.delete(key)
  map.set(key, value)
  while (map.size > max) {
    const oldest = map.keys().next().value as K | undefined
    if (oldest === undefined) break
    map.delete(oldest)
  }
}
