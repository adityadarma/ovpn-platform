import { z } from 'zod'

export const RegisterNodeSchema = z.object({
  hostname: z.string().min(1),
  ip: z.string().ip(),
  port: z.number().int().min(1).max(65535).default(1194),
  region: z.string().optional(),
  version: z.string().min(1),
})

export const HeartbeatSchema = z.object({
  nodeId: z.string().uuid(),
})

export const NodeIdParamSchema = z.object({
  id: z.string().uuid(),
})

export type RegisterNodeInput = z.infer<typeof RegisterNodeSchema>
export type HeartbeatInput = z.infer<typeof HeartbeatSchema>
