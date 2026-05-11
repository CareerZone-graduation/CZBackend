import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID không hợp lệ');

export const workflowIdParam = z.object({ workflowId: objectId });
export const nodeIdParam = z.object({ nodeId: objectId });
export const connectionIdParam = z.object({ connectionId: objectId });

export const createWorkflowBody = z.object({
  name: z.string().min(1, 'Tên workflow là bắt buộc').max(200),
  description: z.string().optional().default(''),
  templateId: objectId.optional(),
  jobId: objectId.optional(),
  isTemplate: z.boolean().optional().default(false)
});

export const updateWorkflowBody = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  status: z.enum(['INACTIVE', 'ACTIVE']).optional()
});

export const cloneWorkflowBody = z.object({
  name: z.string().min(1).max(200).optional()
});

export const createNodeBody = z.object({
  type: z.enum(['STAGE', 'END', 'CONDITION', 'ACTION_EMAIL', 'ACTION_AI', 'ACTION_TEST', 'ACTION_DELAY']),
  name: z.string().min(1).max(200),
  position: z.object({ x: z.number(), y: z.number() }),
  config: z.record(z.any()).optional().default({})
});

export const updateNodeBody = z.object({
  name: z.string().min(1).max(200).optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  config: z.record(z.any()).optional()
});

export const batchNodesBody = z.object({
  nodes: z.array(z.object({
    _id: objectId.optional(),
    type: z.enum(['STAGE', 'END', 'CONDITION', 'ACTION_EMAIL', 'ACTION_AI', 'ACTION_TEST', 'ACTION_DELAY']),
    name: z.string().min(1).max(200),
    position: z.object({ x: z.number(), y: z.number() }),
    config: z.record(z.any()).optional().default({})
  }))
});

export const createConnectionBody = z.object({
  sourceNodeId: objectId,
  sourcePort: z.enum(['default', 'true', 'false']).optional().default('default'),
  targetNodeId: objectId,
  targetPort: z.string().optional().default('input')
});

export const batchConnectionsBody = z.object({
  connections: z.array(z.object({
    _id: objectId.optional(),
    sourceNodeId: objectId,
    sourcePort: z.enum(['default', 'true', 'false']).optional().default('default'),
    targetNodeId: objectId,
    targetPort: z.string().optional().default('input')
  }))
});

export const listWorkflowQuery = z.object({
  isTemplate: z.enum(['true', 'false']).optional(),
  status: z.enum(['INACTIVE', 'ACTIVE']).optional(),
  archived: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20)
}).optional();
