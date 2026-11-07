/** Subscribe the board to the session-link facade (live titles / running state / availability). */

import { useEffect, useState } from 'react'
import type { SessionLinkApi, SessionLinkSnapshot } from '../../sessions/contract.js'

export function useSessionLinks(api: SessionLinkApi): SessionLinkSnapshot {
  const [snapshot, setSnapshot] = useState<SessionLinkSnapshot>(() => api.list())
  useEffect(() => {
    setSnapshot(api.list())
    return api.subscribe(() => setSnapshot(api.list()))
  }, [api])
  return snapshot
}
