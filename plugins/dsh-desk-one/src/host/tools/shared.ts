/**
 * Shared surface for the plugin's agent tools.
 *
 * Every tool answers with one JSON string (rendered verbatim in the transcript) and re-throws
 * failures unchanged: the tool runtime owns error classification, so a helper must not swallow or
 * reword an error it cannot interpret.
 */

/** One tool's output schema + renderer: plain JSON text in the conversation. */
export const textOutput = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}

/**
 * Re-throw a tool failure unchanged.
 * @param error - any thrown value.
 * @returns never; always throws.
 */
export function toolError(error: unknown): never {
  if (error instanceof Error) throw error
  throw new Error(String(error))
}
