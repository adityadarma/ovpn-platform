import { z } from 'zod'

export const TaskResultSchema = z.object({
  status: z.enum(['success', 'failed']),
  result: z.record(z.unknown()).optional(),
  errorMessage: z.string().optional(),
})

export type TaskResultInput = z.infer<typeof TaskResultSchema>
