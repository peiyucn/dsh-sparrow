


export const textOutput = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}


export function toolError(error: unknown): never {
  if (error instanceof Error) throw error
  throw new Error(String(error))
}
