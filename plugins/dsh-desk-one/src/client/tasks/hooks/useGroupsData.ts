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
  readonly reorderGroups: (status: TaskStatus, ordered: readonly DeskTaskGroup[]) => void
  readonly removeGroup: (group: DeskTaskGroup) => void
  /** Cross-lane move; resolves the moved group plus its cards whose status changed. */
  readonly moveGroupToLane: (group: DeskTaskGroup, status: TaskStatus, order?: number) => Promise<{
    group: DeskTaskGroup
    tasks: readonly DeskTask[]
  } | null>
}

export function useGroupsData(t: DeskTranslator, actions: Actions): GroupsData {
  const { listGroups, createGroup, updateGroup, moveGroup, deleteGroup } = actions
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

  const reorderGroups = useCallback((status: TaskStatus, ordered: readonly DeskTaskGroup[]): void => {
    setGroups(current => current.map(group => {
      if (group.status !== status) return group
      const index = ordered.findIndex(item => item.id === group.id)
      return index === -1 || group.order === index ? group : { ...group, order: index }
    }))
    ordered.forEach((group, index) => {
      if (group.order === index) return
      enqueue(group.id, () => run(async () => {
        const latest = groupsRef.current.find(item => item.id === group.id)
        if (latest === undefined) return
        const updated = await updateGroup({ id: group.id, expectedRevision: latest.revision, patch: { order: index } })
        replace(updated)
      }))
    })
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
      replace(result.group)
      setActionError(null)
      return result
    } catch (reason) {
      setActionError(t('state.saveFailed', { message: messageOf(reason) }))
      void reload()
      return null
    }
  }, [moveGroup, reload, replace, t])

  return {
    groups, loading, loadError, actionError, setActionError,
    reload, createGroup: createGroupAction, renameGroup, reorderGroups, removeGroup, moveGroupToLane,
  }
}
