/** Build the session index from host header facts: metadata only, never transcript content. */

import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-workspace'
import { readArchivedIds } from './archive-set.js'
import type { HeaderFactsStore } from './archive.js'
import type { HeaderFacts } from './headers.js'
import type { SessionIndexDraft } from './records.js'
import { titlesFor } from './titles.js'

/**
 * Read every persisted header once, resolve titles through the same three-tier chain as the
 * archive tree, and return FK rows for the unified `nodes` table. Availability distinguishes
 * active vs archived; running comes from the live agent registry.
 */
export async function buildSessionIndex(
  ctx: Context,
  headerFacts: HeaderFactsStore<HeaderFacts>,
): Promise<SessionIndexDraft[]> {
  const { headers } = await headerFacts.get()
  if (headers.length === 0) return []
  const archived = new Set((await readArchivedIds(ctx)).map(String))
  const titles = await titlesFor(ctx, headers, header => String(header.id))
  return headers.map(header => {
    const id = String(header.id)
    const sessionId = SessionId(id)
    const running = ctx.agents.get(sessionId)?.status === 'running'
    return {
      sessionId: id,
      title: titles.get(id) ?? id,
      ...(header.cwd === undefined ? {} : { cwd: header.cwd }),
      ...(header.parentSession === undefined ? {} : { parentSessionId: String(header.parentSession) }),
      subagent: header.origin === 'subagent',
      running,
      availability: archived.has(id) ? 'archived' : 'available',
      updatedAt: header.createdAt,
    }
  })
}
