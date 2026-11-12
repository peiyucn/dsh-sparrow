/**
 * Optional host skill catalog for new-note drafting.
 *
 * The panel has no session yet, so it reads the **default agent preset's scope**, the same
 * composition a new session gets: that is what makes the list match the official `/` skill menu
 * and the command palette (which are session-addressed). A host without the services simply
 * offers no skills; the page never injects a skill body — the prompt only names one.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SkillCatalog } from './notebook/host.js'

/** Live catalog getter: undefined until (and unless) the skill service is available. */
export type SkillCatalogGetter = () => SkillCatalog | undefined

/** The slice of the skill registry the notebook page uses. */
interface SkillServiceLike {
  list: (options: { cwd?: string; scope?: unknown; signal?: AbortSignal }) => Promise<readonly {
    name: string
    description: string
    source: string
    invocation?: { modelInvocable: boolean }
  }[]>
}

/** The slice of the preset registry that mints a read-only scope lease. */
interface PresetRegistryLike {
  acquireScope(id?: string): Promise<{ readonly key: unknown; [Symbol.asyncDispose](): Promise<void> }>
}

/**
 * Watch the optional skill service (and the preset registry when present).
 * @param ctx - DSH plugin context.
 * @returns a getter for the current catalog (undefined while the service is absent).
 */
export function watchSkillCatalog(ctx: Context): SkillCatalogGetter {
  let catalog: SkillCatalog | undefined
  // Test doubles and stripped hosts may not implement the optional-dependency fork; the notebook
  // simply offers no skills there instead of failing the whole apply.
  if (typeof ctx.inject !== 'function') return () => undefined
  ctx.inject(['skills'], (scoped) => {
    const skills = (scoped as unknown as { get(name: string): SkillServiceLike }).get('skills')
    const presets = (scoped as unknown as { get(name: string): unknown }).get('agentPresets') as PresetRegistryLike | undefined
    catalog = {
      async list(options) {
        if (presets !== undefined && typeof presets.acquireScope === 'function') {
          try {
            const lease = await presets.acquireScope()
            try {
              return await skills.list({ ...options, scope: lease.key })
            } finally {
              await lease[Symbol.asyncDispose]()
            }
          } catch {
            // A host without a usable preset registry falls back to the global catalog.
          }
        }
        return await skills.list(options)
      },
    }
    scoped.effect(() => () => { catalog = undefined }, 'dsh-desk-one: notebook skill catalog')
  })
  return () => catalog
}
