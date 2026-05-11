import mongoose from 'mongoose';
import { RecruiterProfile, Workflow, WorkflowConnection, WorkflowNode, WorkflowTemplate } from '../models/index.js';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../utils/AppError.js';

const toObjectId = (value, fieldName = 'ID') => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new BadRequestError(`${fieldName} không hợp lệ`);
  }
  return new mongoose.Types.ObjectId(value);
};

const findRecruiterProfileByUserId = async (userId) => {
  console.log('userId', userId);
  const recruiterProfile = await RecruiterProfile.findOne({ userId: toObjectId(userId) }).lean();
  if (!recruiterProfile) {
    throw new UnauthorizedError('Bạn không có quyền truy cập chức năng này');
  }
  return recruiterProfile;
};

const mapTemplateNodesToWorkflowNodes = (templateNodes = []) => {
  const nodeMap = new Map();

  const nodes = templateNodes.map((node, index) => {
    const newNodeId = new mongoose.Types.ObjectId();
    const originalKey = node?._id ? String(node._id) : `index-${index}`;
    nodeMap.set(originalKey, newNodeId);

    return {
      _id: newNodeId,
      type: node.type,
      name: node.name,
      position: {
        x: Number(node.position?.x ?? 0),
        y: Number(node.position?.y ?? 0)
      },
      config: node.config || {}
    };
  });

  return { nodes, nodeMap };
};

const mapTemplateConnectionsToWorkflowConnections = (templateConnections = [], nodeMap) => {
  const output = [];

  for (const connection of templateConnections) {
    const sourceKey = connection?.sourceNodeId ? String(connection.sourceNodeId) : null;
    const targetKey = connection?.targetNodeId ? String(connection.targetNodeId) : null;

    if (!sourceKey || !targetKey) continue;

    const mappedSource = nodeMap.get(sourceKey);
    const mappedTarget = nodeMap.get(targetKey);

    if (!mappedSource || !mappedTarget) continue;

    output.push({
      sourceNodeId: mappedSource,
      sourcePort: connection.sourcePort || 'default',
      targetNodeId: mappedTarget,
      targetPort: connection.targetPort || 'input'
    });
  }

  return output;
};

export const listTemplates = async (userId, query = {}) => {
  const recruiterProfile = await findRecruiterProfileByUserId(userId);

  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);

  if (Number.isNaN(page) || page < 1 || Number.isNaN(limit) || limit < 1 || limit > 100) {
    throw new BadRequestError('Thông tin phân trang không hợp lệ');
  }

  const filter = {
    $or: [
      { isSystemTemplate: true },
      { companyId: recruiterProfile._id }
    ]
  };

  if (query.category) {
    filter.category = query.category;
  }

  const skip = (page - 1) * limit;

  const [items, totalItems] = await Promise.all([
    WorkflowTemplate.find(filter)
      .sort({ isSystemTemplate: -1, updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    WorkflowTemplate.countDocuments(filter)
  ]);

  return {
    data: items,
    meta: {
      currentPage: page,
      totalPages: Math.ceil(totalItems / limit) || 1,
      totalItems,
      limit
    }
  };
};

export const getTemplateById = async (userId, templateId) => {
  const recruiterProfile = await findRecruiterProfileByUserId(userId);

  const template = await WorkflowTemplate.findById(toObjectId(templateId, 'Template ID')).lean();

  if (!template) {
    throw new NotFoundError('Không tìm thấy mẫu workflow');
  }

  const canAccessTemplate =
    template.isSystemTemplate ||
    (template.companyId && String(template.companyId) === String(recruiterProfile._id));

  if (!canAccessTemplate) {
    throw new UnauthorizedError('Bạn không có quyền xem mẫu workflow này');
  }

  return template;
};

export const applyTemplate = async (templateId, userId, payload = {}) => {
  const recruiterProfile = await findRecruiterProfileByUserId(userId);

  const template = await getTemplateById(userId, templateId);

  const workflowName = payload.name?.trim() || template.name;
  if (!workflowName) {
    throw new BadRequestError('Tên workflow là bắt buộc');
  }

  const { nodes, nodeMap } = mapTemplateNodesToWorkflowNodes(template.workflowDefinition?.nodes || []);
  const mappedConnections = mapTemplateConnectionsToWorkflowConnections(
    template.workflowDefinition?.connections || [],
    nodeMap
  );

  const session = await mongoose.startSession();
  let workflow;

  try {
    await session.withTransaction(async () => {
      [workflow] = await Workflow.create([
        {
          name: workflowName,
          description: payload.description ?? template.description ?? '',
          companyId: recruiterProfile._id,
          isTemplate: !!payload.isTemplate,
          jobId: payload.jobId ? toObjectId(payload.jobId, 'Job ID') : null,
          status: 'INACTIVE',
          createdBy: toObjectId(userId, 'User ID'),
          metadata: {
            version: 1,
            totalNodes: nodes.length,
            totalConnections: mappedConnections.length
          }
        }
      ], { session });

      if (nodes.length) {
        await WorkflowNode.insertMany(nodes.map((node) => ({ ...node, workflowId: workflow._id })), {
          ordered: true,
          session
        });
      }

      if (mappedConnections.length) {
        await WorkflowConnection.insertMany(
          mappedConnections.map((connection) => ({ ...connection, workflowId: workflow._id })),
          { ordered: true, session }
        );
      }
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw new BadRequestError('Template workflow có kết nối trùng lặp, vui lòng kiểm tra lại dữ liệu');
    }
    throw error;
  } finally {
    await session.endSession();
  }

  const [createdNodes, createdConnections] = await Promise.all([
    WorkflowNode.find({ workflowId: workflow._id }).sort({ createdAt: 1 }).lean(),
    WorkflowConnection.find({ workflowId: workflow._id }).sort({ createdAt: 1 }).lean()
  ]);

  return {
    ...workflow.toObject(),
    nodes: createdNodes,
    connections: createdConnections
  };
};
