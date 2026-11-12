/**
 * Optional host skill catalog, reached through a cordis optional-dependency fork.
 *
 * cordis 4 refuses to read an undeclared service (`cannot get property "skills" without inject`),
 * so a direct `ctx.skills` read inside `apply` would throw and disable the whole panel. The fork
 * only attaches when the skill service exists; the rest of the notebook page never depends on it.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SkillCatalog } from './notebook/host.js'

/** Live catalog getter: undefined until (and unless) the skill service is available. */
export type SkillCatalogGetter = () => SkillCatalog | undefined

/** The slice of the skill registry the notebook page uses. */
interface SkillServiceLike {
  list: (options: { cwd?: string; signal?: AbortSignal }) => Promise<readonly {
    name: string
    description: string
    source: string
    invocation?: { modelInvocable: boolean }
  }[]>
}

/**
 * Watch the optional skill service.
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
    catalog = { list: options => skills.list(options) }
    scoped.effect(() => () => { catalog = undefined }, 'dsh-desk-one: notebook skill catalog')
  })
  return () => catalog
}
