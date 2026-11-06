/**
 * Task collection state: loading, optimistic writes and a per-task write chain.
 * Mirrors the notes store so both features share the same concurrency habits.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { CreateTaskRequest, DeskTask, TaskPatchRequest } from '../../../contract.js'
import type { DeskTranslator } from '../../app/types.js'
import { messageOf } from '../../app/utils.js'

type Actions = {
  readonly listTasks: () => Promise<readonly DeskTask[]>
  readonly createTask: (input: CreateTaskRequest) => Promise<DeskTask>
  readonly updateTask: (input: { id: string; expectedRevision: number; patch: TaskPatchRequest }) => Promise<DeskTask>
  readonly deleteTask: (id: string) => Promise<void>
}

export interface TasksData {
  readonly tasks: readonly DeskTask[]
  readonly setTasks: Dispatch<SetStateAction<readonly DeskTask[]>>
  readonly loading: boolean
  readonly loadError: string | null
  readonly actionError: string | null
  readonly setActionError: (message: string | null) => void
  readonly reload: () => Promise<void>
  readonly savePatch: (task: DeskTask, patch: TaskPatchRequest) => void
  readonly addTask: (input: CreateTaskRequest) => Promise<DeskTask | null>
  readonly removeWithFeedback: (id: string) => void
}

export function useTasksData(t: DeskTranslator, actions: Actions): TasksData {
  const { listTasks, createTask, updateTask, deleteTask } = actions
  const [tasks, setTasks] = useState<readonly DeskTask[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const tasksRef = useRef<readonly DeskTask[]>(tasks)
  tasksRef.current = tasks
  const writeChains = useRef(new Map<string, Promise<void>>())
  const loadSeq = useRef(0)

  const reload = useCallback(async (): Promise<void> => {
    const seq = ++loadSeq.current
    setLoading(true)
    try {
      const next = await listTasks()
      if (seq !== loadSeq.current) return
      setTasks(next)
      setLoadError(null)
    } catch (reason) {
      if (seq !== loadSeq.current) return
      setLoadError(messageOf(reason))
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }, [listTasks])

  useEffect(() => { void reload() }, [reload])

  const enqueueWrite = useCallback((id: string, task: () => Promise<void>): void => {
    const previous = writeChains.current.get(id) ?? Promise.resolve()
    const next = previous.then(task, task)
    writeChains.current.set(id, next)
    void next.finally(() => {
      if (writeChains.current.get(id) === next) writeChains.current.delete(id)
    })
  }, [])

  const replaceTask = useCallback((updated: DeskTask): void => {
    setTasks(current => current.map(task => task.id === updated.id ? updated : task))
  }, [])

  const savePatch = useCallback((task: DeskTask, patch: TaskPatchRequest): void => {
    enqueueWrite(task.id, async () => {
      const current = tasksRef.current.find(item => item.id === task.id)
      if (current === undefined) return
      try {
        const updated = await updateTask({ id: task.id, expectedRevision: current.revision, patch })
        replaceTask(updated)
        setActionError(null)
      } catch (reason) {
        setActionError(t('state.saveFailed', { message: messageOf(reason) }))
        void reload()
      }
    })
  }, [enqueueWrite, reload, replaceTask, t, updateTask])

  const addTask = useCallback(async (input: CreateTaskRequest): Promise<DeskTask | null> => {
    try {
      const task = await createTask(input)
      setTasks(current => [...current, task])
      setActionError(null)
      return task
    } catch (reason) {
      setActionError(t('state.saveFailed', { message: messageOf(reason) }))
      return null
    }
  }, [createTask, t])

  const removeWithFeedback = useCallback((id: string): void => {
    enqueueWrite(id, async () => {
      try {
        await deleteTask(id)
        setTasks(current => current.filter(task => task.id !== id))
        setActionError(null)
      } catch (reason) {
        setActionError(t('state.saveFailed', { message: messageOf(reason) }))
      }
    })
  }, [deleteTask, enqueueWrite, t])

  return {
    tasks, setTasks, loading, loadError, actionError, setActionError,
    reload, savePatch, addTask, removeWithFeedback,
  }
}
