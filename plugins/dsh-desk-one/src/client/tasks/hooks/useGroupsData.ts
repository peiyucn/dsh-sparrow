/**
 * Group collection state: groups are first-class host records (name / lane / order), so the
 * client never invents group metadata. Writes are optimistic and serialized per group id.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CreateTaskGroupRequest, DeskTask, DeskTaskGroup, TaskGroupPatchRequest, TaskStatus } from '../../../contract.js'
import type { DeskTranslator } from '../../app/types.js'
import { messageOf } from '../../app/utils.js'

interface Actions {
  readonly listGroups: () => Promise<readonly DeskTaskGroup[]>
  readonly createGroup: (input: CreateTaskGroupRequest) => Promise<DeskTaskGroup>
  readonly updateGroup: (input: {
    id: string
    expectedRevision: number
    patch: TaskGroupPatchRequest
  }) => Promise<DeskTaskGroup>
  readonly moveGroup: (input: {
    id: string
    expectedRevision: number
    status: string
    order?: number
  }) => Promise<{ group: DeskTaskGroup; tasks: readonly DeskTask[] }>
  readonly deleteGroup: (id: string) => Promise<void>
  readonly archiveGroup: (input: {
    id: string
    expectedRevision: number
    archived: boolean
  }) => Promise<{ group: DeskTaskGroup; tasks: readonly DeskTask[] }>
}

export interface GroupsData {
  readonly groups: readonly DeskTaskGroup[]
  readonly loading: boolean
  readonly loadError: string | null
  readonly actionError: string | null
  readonly setActionError: (message: string | null) => void
  readonly reload: () => Promise<void>
  readonly createGroup: (input: CreateTaskGroupRequest) => Promise<DeskTaskGroup | null>
  readonly renameGroup: (group: DeskTaskGroup, name: string) => void
  /** Persist dense order for one lane; receives the groups already in their new order. */
  /** Persist arbitrary group orders (shared lane block sequence: order is the block index). */
  readonly setGroupOrders: (entries: readonly { group: DeskTaskGroup; order: number }[]) => void
  readonly removeGroup: (group: DeskTaskGroup) => void
  /** Cross-lane move; resolves the moved group, its cards, and the authoritative group list. */
  readonly moveGroupToLane: (group: DeskTaskGroup, status: TaskStatus, order?: number) => Promise<{
    group: DeskTaskGroup
    tasks: readonly DeskTask[]
    groups: readonly DeskTaskGroup[]
  } | null>
  /** Archive / restore the group together with its cards. */
  readonly archiveGroup: (group: DeskTaskGroup, archived: boolean) => Promise<{
    group: DeskTaskGroup
    tasks: readonly DeskTask[]
  } | null>
}

export function useGroupsData(t: DeskTranslator, actions: Actions): GroupsData {
  const { listGroups, createGroup, updateGroup, moveGroup, deleteGroup, archiveGroup } = actions
  const [groups, setGroups] = useState<readonly DeskTaskGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const groupsRef = useRef<readonly DeskTaskGroup[]>(groups)
  groupsRef.current = groups
  const writeChains = useRef(new Map<string, Promise<void>>())
  const loadSeq = useRef(0)

  const reload = useCallback(async (): Promise<void> => {
    const seq = ++loadSeq.current
    setLoading(true)
    try {
      const next = await listGroups()
      if (seq !== loadSeq.current) return
      setGroups(next)
      setLoadError(null)
    } catch (reason) {
      if (seq !== loadSeq.current) return
      setLoadError(messageOf(reason))
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }, [listGroups])

  useEffect(() => { void reload() }, [reload])

  const replace = useCallback((updated: DeskTaskGroup): void => {
    setGroups(current => current.map(group => group.id === updated.id ? updated : group))
  }, [])

  const enqueue = useCallback((id: string, task: () => Promise<void>): void => {
    const previous = writeChains.current.get(id) ?? Promise.resolve()
    const next = previous.then(task, task)
    writeChains.current.set(id, next)
    void next.finally(() => {
      if (writeChains.current.get(id) === next) writeChains.current.delete(id)
    })
  }, [])

  const run = useCallback(async (task: () => Promise<void>): Promise<void> => {
    try {
      await task()
      setActionError(null)
    } catch (reason) {
      setActionError(t('state.saveFailed', { message: messageOf(reason) }))
      void reload()
    }
  }, [reload, t])

  const createGroupAction = useCallback(async (input: CreateTaskGroupRequest): Promise<DeskTaskGroup | null> => {
    try {
      const group = await createGroup(input)
      setGroups(current => [...current, group])
      setActionError(null)
      return group
    } catch (reason) {
      setActionError(t('state.saveFailed', { message: messageOf(reason) }))
      return null
    }
  }, [createGroup, t])

  const renameGroup = useCallback((group: DeskTaskGroup, name: string): void => {
    const trimmed = name.trim()
    if (trimmed === '' || trimmed === group.name) return
    setGroups(current => current.map(item => item.id === group.id ? { ...item, name: trimmed } : item))
    enqueue(group.id, () => run(async () => {
      const updated = await updateGroup({ id: group.id, expectedRevision: group.revision, patch: { name: trimmed } })
      replace(updated)
    }))
  }, [enqueue, replace, run, updateGroup])

  const setGroupOrders = useCallback((entries: readonly { group: DeskTaskGroup; order: number }[]): void => {
    if (entries.length === 0) return
    const byId = new Map(entries.map(entry => [entry.group.id, entry.order]))
    setGroups(current => current.map(group => {
      const order = byId.get(group.id)
      return order === undefined || group.order === order ? group : { ...group, order }
    }))
    for (const entry of entries) {
      if (entry.group.order === entry.order) continue
      enqueue(entry.group.id, () => run(async () => {
        const updated = await updateGroup({
          id: entry.group.id,
          expectedRevision: entry.group.revision,
          patch: { order: entry.order },
        })
        replace(updated)
      }))
    }
  }, [enqueue, replace, run, updateGroup])

  const removeGroup = useCallback((group: DeskTaskGroup): void => {
    setGroups(current => current.filter(item => item.id !== group.id))
    enqueue(group.id, () => run(async () => {
      await deleteGroup(group.id)
    }))
  }, [deleteGroup, enqueue, run])

  const moveGroupToLane = useCallback(async (group: DeskTaskGroup, status: TaskStatus, order?: number) => {
    try {
      const result = await moveGroup({ id: group.id, expectedRevision: group.revision, status, order })
      // The host renumbered group orders in both lanes while moving: read the authoritative list
      // back so the caller can renumber the unified block sequence with fresh revisions.
      let latestGroups: readonly DeskTaskGroup[] | null = null
      try {
        latestGroups = await listGroups()
        setGroups(latestGroups)
      } catch {
        replace(result.group)
      }
      setActionError(null)
      return { group: result.group, tasks: result.tasks, groups: latestGroups ?? groupsRef.current }
    } catch (reason) {
      setActionError(t('state.saveFailed', { message: messageOf(reason) }))
      void reload()
      return null
    }
  }, [listGroups, moveGroup, reload, replace, setActionError,t])

  const archiveGroupAction = useCallback(async (group: DeskTaskGroup, archived: boolean) => {
    try {
      const result = await archiveGroup({ id: group.id, expectedRevision: group.revision, archived })
      replace(result.group)
      setActionError(null)
      return result
    } catch (reason) {
      setActionError(t('state.saveFailed', { message: messageOf(reason) }))
      void reload()
      return null
    }
  }, [archiveGroup, reload, replace, t])

  return {
    groups, loading, loadError, actionError, setActionError,
    reload, createGroup: createGroupAction, renameGroup, setGroupOrders, removeGroup,
    moveGroupToLane, archiveGroup: archiveGroupAction,
  }
}
