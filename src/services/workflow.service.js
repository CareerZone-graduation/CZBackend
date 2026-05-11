import mongoose from 'mongoose';
import {
  Application,
  RecruiterProfile,
  Workflow,
  WorkflowConnection,
  WorkflowExecution,
  WorkflowNode,
  WorkflowTemplate,
  Job
} from '../models/index.js';
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
  UnprocessableEntityError
} from '../utils/AppError.js';

const WORKFLOW_STATUSES = ['INACTIVE', 'ACTIVE'];

const toObjectId = (value, fieldName = 'ID') => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new BadRequestError(`${fieldName} không hợp lệ`);
  }
  return new mongoose.Types.ObjectId(value);
};

const normalizeBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
};

const buildWorkflowFilter = (query = {}, recruiterProfileId) => {
  const filter = { companyId: recruiterProfileId };

  const isTemplate = normalizeBoolean(query.isTemplate);
  if (typeof isTemplate === 'boolean') {
    filter.isTemplate = isTemplate;
  }

  if (query.status) {
    if (!WORKFLOW_STATUSES.includes(query.status)) {
      throw new BadRequestError('Trạng thái workflow không hợp lệ');
    }
    filter.status = query.status;
  }

  return filter;
};

const assertNodeTypeRules = (nodes, outgoingByNode) => {
  for (const node of nodes) {
    const outgoing = outgoingByNode.get(node._id.toString()) || [];

    if (node.type === 'CONDITION') {
      const trueEdges = outgoing.filter((edge) => edge.sourcePort === 'true').length;
      const falseEdges = outgoing.filter((edge) => edge.sourcePort === 'false').length;
      const defaultEdges = outgoing.filter((edge) => edge.sourcePort === 'default').length;

      if (defaultEdges > 0) {
        throw new UnprocessableEntityError('Node điều kiện chỉ được nối qua nhánh true/false');
      }

      if (trueEdges > 1 || falseEdges > 1) {
        throw new UnprocessableEntityError('Node điều kiện chỉ được có tối đa một kết nối cho mỗi nhánh true/false');
      }
    } else {
      const nonDefaultEdges = outgoing.filter((edge) => edge.sourcePort !== 'default').length;
      if (nonDefaultEdges > 0) {
        throw new UnprocessableEntityError('Node không phải điều kiện chỉ được dùng sourcePort mặc định');
      }
    }
  }
};

const assertGraphIsAcyclic = (nodes, connections) => {
  const inDegree = new Map();
  const adjacency = new Map();

  for (const node of nodes) {
    const id = node._id.toString();
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  for (const edge of connections) {
    const source = edge.sourceNodeId.toString();
    const target = edge.targetNodeId.toString();

    if (!adjacency.has(source) || !adjacency.has(target)) {
      throw new UnprocessableEntityError('Kết nối chứa node không thuộc workflow');
    }

    if (source === target) {
      throw new UnprocessableEntityError('Không được tạo vòng lặp trên cùng một node');
    }

    adjacency.get(source).push(target);
    inDegree.set(target, (inDegree.get(target) || 0) + 1);
  }

  const queue = [];
  for (const [nodeId, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(nodeId);
  }

  if (queue.length === 0) {
    throw new UnprocessableEntityError('Workflow phải có ít nhất một node bắt đầu');
  }
  
  if (queue.length > 1) {
    throw new UnprocessableEntityError('Workflow chỉ được phép có duy nhất MỘT node bắt đầu (không có kết nối đầu vào). Hãy xóa các node bị cô lập hoặc kết nối chúng lại.');
  }

  // Lưu lại ID của node bắt đầu để validate tiếp
  const startNodeId = queue[0];

  let visited = 0;
  while (queue.length > 0) {
    const current = queue.shift();
    visited += 1;

    for (const next of adjacency.get(current) || []) {
      inDegree.set(next, inDegree.get(next) - 1);
      if (inDegree.get(next) === 0) {
        queue.push(next);
      }
    }
  }

  if (visited !== nodes.length) {
    throw new UnprocessableEntityError('Workflow không hợp lệ: đồ thị có chu trình hoặc có node không thể kết nối tới');
  }
  
  return startNodeId;
};

const validateWorkflowGraph = async (workflowId) => {
  const [nodes, connections] = await Promise.all([
    WorkflowNode.find({ workflowId }).lean(),
    WorkflowConnection.find({ workflowId }).lean()
  ]);

  if (!nodes.length) {
    throw new UnprocessableEntityError('Workflow phải có ít nhất một node trước khi kích hoạt');
  }

  const hasStageNode = nodes.some((node) => node.type === 'STAGE');
  if (!hasStageNode) {
    throw new UnprocessableEntityError('Workflow phải có ít nhất một node STAGE');
  }

  // OFFER_SENT và ACCEPTED yêu cầu recruiter nhập thủ công (offer letter, file đính kèm)
  const DISALLOWED_STATUS_MAPPINGS = ['OFFER_SENT', 'ACCEPTED'];
  for (const node of nodes) {
    if (node.type === 'STAGE' && DISALLOWED_STATUS_MAPPINGS.includes(node.config?.statusMapping)) {
      throw new UnprocessableEntityError(
        `Không thể dùng trạng thái "${node.config.statusMapping}" trong workflow. Bước gửi offer cần thực hiện thủ công (có đính kèm thư mời và file offer).`
      );
    }
  }

  const nodeIdSet = new Set(nodes.map((node) => node._id.toString()));
  const uniqueConnectionSet = new Set();

  for (const connection of connections) {
    const sourceId = connection.sourceNodeId.toString();
    const targetId = connection.targetNodeId.toString();

    if (!nodeIdSet.has(sourceId) || !nodeIdSet.has(targetId)) {
      throw new UnprocessableEntityError('Có kết nối tham chiếu tới node không tồn tại');
    }

    const connectionKey = `${sourceId}:${connection.sourcePort}:${targetId}:${connection.targetPort}`;
    if (uniqueConnectionSet.has(connectionKey)) {
      throw new UnprocessableEntityError('Workflow không hợp lệ: có kết nối bị trùng lặp');
    }
    uniqueConnectionSet.add(connectionKey);
  }

  const outgoingByNode = new Map();
  for (const edge of connections) {
    const key = edge.sourceNodeId.toString();
    if (!outgoingByNode.has(key)) {
      outgoingByNode.set(key, []);
    }
    outgoingByNode.get(key).push(edge);
  }

  assertNodeTypeRules(nodes, outgoingByNode);
  const startNodeId = assertGraphIsAcyclic(nodes, connections);

  const startNode = nodes.find(n => n._id.toString() === startNodeId);
  if (startNode.type !== 'STAGE') {
    throw new UnprocessableEntityError('Node bắt đầu của Workflow bắt buộc phải là loại STAGE (Vòng/Cột)');
  }

  return {
    totalNodes: nodes.length,
    totalConnections: connections.length
  };
};

const updateWorkflowMetadata = async (workflowId, session = null) => {
  const totalNodesQuery = WorkflowNode.countDocuments({ workflowId });
  const totalConnectionsQuery = WorkflowConnection.countDocuments({ workflowId });

  if (session) {
    totalNodesQuery.session(session);
    totalConnectionsQuery.session(session);
  }

  const [totalNodes, totalConnections] = await Promise.all([totalNodesQuery, totalConnectionsQuery]);

  const updateQuery = Workflow.findByIdAndUpdate(workflowId, {
    $set: {
      'metadata.totalNodes': totalNodes,
      'metadata.totalConnections': totalConnections
    }
  });

  if (session) {
    updateQuery.session(session);
  }

  await updateQuery;

  return { totalNodes, totalConnections };
};
const mapTemplateNodesToCreatePayload = (templateNodes = []) => {
  const nodeIdMap = new Map();
  const createdNodes = templateNodes.map((node, index) => {
    const newNodeId = new mongoose.Types.ObjectId();
    const originalKey = node?._id ? String(node._id) : `index-${index}`;
    nodeIdMap.set(originalKey, newNodeId);

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

  return { createdNodes, nodeIdMap };
};

const mapTemplateConnectionsToCreatePayload = (templateConnections = [], nodeIdMap) => {
  const output = [];

  for (const connection of templateConnections) {
    const sourceKey = connection?.sourceNodeId ? String(connection.sourceNodeId) : null;
    const targetKey = connection?.targetNodeId ? String(connection.targetNodeId) : null;

    if (!sourceKey || !targetKey) continue;

    const mappedSource = nodeIdMap.get(sourceKey);
    const mappedTarget = nodeIdMap.get(targetKey);

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

export const findRecruiterProfileByUserId = async (userId) => {
  const recruiterProfile = await RecruiterProfile.findOne({ userId }).lean();
  if (!recruiterProfile) {
    throw new UnauthorizedError('Bạn không có quyền truy cập chức năng này');
  }
  return recruiterProfile;
};

export const getWorkflowOwnershipContext = async (workflowId, userId) => {
  const [recruiterProfile, workflow] = await Promise.all([
    findRecruiterProfileByUserId(userId),
    Workflow.findById(toObjectId(workflowId, 'Workflow ID'))
  ]);

  if (!workflow) {
    throw new NotFoundError('Không tìm thấy workflow');
  }

  if (workflow.companyId.toString() !== recruiterProfile._id.toString()) {
    throw new UnauthorizedError('Bạn không có quyền truy cập workflow này');
  }

  return { recruiterProfile, workflow };
};

export const listWorkflows = async (userId, query = {}) => {
  const recruiterProfile = await findRecruiterProfileByUserId(userId);
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);

  if (Number.isNaN(page) || page < 1 || Number.isNaN(limit) || limit < 1 || limit > 100) {
    throw new BadRequestError('Thông tin phân trang không hợp lệ');
  }

  const filter = buildWorkflowFilter(query, recruiterProfile._id);
  const skip = (page - 1) * limit;

  const [items, totalItems] = await Promise.all([
    Workflow.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Workflow.countDocuments(filter)
  ]);

  const workflowIds = items.map(w => w._id);
  const jobs = await Job.find({ workflowId: { $in: workflowIds } }).select('title workflowId').lean();

  const jobsByWorkflow = {};
  for (const job of jobs) {
    const wId = job.workflowId.toString();
    if (!jobsByWorkflow[wId]) jobsByWorkflow[wId] = [];
    jobsByWorkflow[wId].push(job.title);
  }

  for (const item of items) {
    item.attachedJobTitles = jobsByWorkflow[item._id.toString()] || [];
  }

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

export const getWorkflowById = async (userId, workflowId) => {
  const { workflow } = await getWorkflowOwnershipContext(workflowId, userId);

  const [nodes, connections] = await Promise.all([
    WorkflowNode.find({ workflowId: workflow._id }).sort({ createdAt: 1 }).lean(),
    WorkflowConnection.find({ workflowId: workflow._id }).sort({ createdAt: 1 }).lean()
  ]);

  return {
    ...workflow.toObject(),
    nodes,
    connections
  };
};

export const createWorkflow = async (userId, payload = {}) => {
  const recruiterProfile = await findRecruiterProfileByUserId(userId);

  const workflowName = payload.name?.trim();
  if (!workflowName) {
    throw new BadRequestError('Tên workflow là bắt buộc');
  }

  let initialNodes = [];
  let initialConnections = [];

  if (payload.templateId) {
    const template = await WorkflowTemplate.findById(toObjectId(payload.templateId, 'Template ID')).lean();
    if (!template) {
      throw new NotFoundError('Không tìm thấy mẫu workflow');
    }

    const canAccessTemplate =
      template.isSystemTemplate ||
      (template.companyId && String(template.companyId) === String(recruiterProfile._id));

    if (!canAccessTemplate) {
      throw new UnauthorizedError('Bạn không có quyền sử dụng mẫu workflow này');
    }

    const { createdNodes, nodeIdMap } = mapTemplateNodesToCreatePayload(template.workflowDefinition?.nodes || []);
    initialNodes = createdNodes;
    initialConnections = mapTemplateConnectionsToCreatePayload(
      template.workflowDefinition?.connections || [],
      nodeIdMap
    );
  }

  const session = await mongoose.startSession();
  let workflow;

  try {
    await session.withTransaction(async () => {
      [workflow] = await Workflow.create([
        {
          name: workflowName,
          description: payload.description || '',
          companyId: recruiterProfile._id,
          isTemplate: !!payload.isTemplate,
          jobId: payload.jobId ? toObjectId(payload.jobId, 'Job ID') : null,
          status: 'INACTIVE',
          createdBy: toObjectId(userId, 'User ID'),
          metadata: {
            version: 1,
            totalNodes: initialNodes.length,
            totalConnections: initialConnections.length
          }
        }
      ], { session });

      if (initialNodes.length) {
        const nodesToInsert = initialNodes.map((node) => ({ ...node, workflowId: workflow._id }));
        await WorkflowNode.insertMany(nodesToInsert, { ordered: true, session });
      }

      if (initialConnections.length) {
        const connectionsToInsert = initialConnections.map((connection) => ({
          ...connection,
          workflowId: workflow._id
        }));
        await WorkflowConnection.insertMany(connectionsToInsert, { ordered: true, session });
      }
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw new BadRequestError('Workflow chứa kết nối trùng lặp, vui lòng kiểm tra lại template');
    }
    throw error;
  } finally {
    await session.endSession();
  }

  return getWorkflowById(userId, workflow._id.toString());
};
export const updateWorkflow = async (userId, workflowId, payload = {}) => {
  const { workflow } = await getWorkflowOwnershipContext(workflowId, userId);

  const updateData = {};

  if (typeof payload.name !== 'undefined') {
    const name = payload.name?.trim();
    if (!name) {
      throw new BadRequestError('Tên workflow không được để trống');
    }
    updateData.name = name;
  }

  if (typeof payload.description !== 'undefined') {
    updateData.description = payload.description || '';
  }

  if (typeof payload.status !== 'undefined') {
    if (!WORKFLOW_STATUSES.includes(payload.status)) {
      throw new BadRequestError('Trạng thái workflow không hợp lệ');
    }
    updateData.status = payload.status;
  }

  if (!Object.keys(updateData).length) {
    return getWorkflowById(userId, workflow._id.toString());
  }

  await Workflow.findByIdAndUpdate(workflow._id, { $set: updateData });

  return getWorkflowById(userId, workflow._id.toString());
};

export const deleteWorkflow = async (userId, workflowId) => {
  const { workflow } = await getWorkflowOwnershipContext(workflowId, userId);

  const attachedApplications = await Application.countDocuments({ workflowId: workflow._id });
  if (attachedApplications > 0) {
    throw new BadRequestError('Không thể xóa workflow đang được gán cho hồ sơ ứng tuyển');
  }

  await Promise.all([
    WorkflowConnection.deleteMany({ workflowId: workflow._id }),
    WorkflowNode.deleteMany({ workflowId: workflow._id }),
    Workflow.findByIdAndDelete(workflow._id)
  ]);

  return { message: 'Xóa workflow thành công' };
};

export const activateWorkflow = async (userId, workflowId) => {
  const { workflow } = await getWorkflowOwnershipContext(workflowId, userId);

  if (workflow.status === 'ACTIVE') {
    throw new BadRequestError('Workflow đang ở trạng thái ACTIVE');
  }

  const graphStats = await validateWorkflowGraph(workflow._id);

  const updated = await Workflow.findByIdAndUpdate(
    workflow._id,
    {
      $set: {
        status: 'ACTIVE',
        'metadata.totalNodes': graphStats.totalNodes,
        'metadata.totalConnections': graphStats.totalConnections
      },
      $inc: { 'metadata.version': 1 }
    },
    { new: true }
  ).lean();

  return updated;
};

export const createNode = async (userId, workflowId, payload) => {
  const { workflow } = await getWorkflowOwnershipContext(workflowId, userId);

  const node = await WorkflowNode.create({
    workflowId: workflow._id,
    type: payload.type,
    name: payload.name,
    position: payload.position,
    config: payload.config || {}
  });

  await updateWorkflowMetadata(workflow._id);

  return node;
};

export const updateNode = async (userId, workflowId, nodeId, payload = {}) => {
  const { workflow } = await getWorkflowOwnershipContext(workflowId, userId);
  const nodeObjectId = toObjectId(nodeId, 'Node ID');

  const node = await WorkflowNode.findOne({ _id: nodeObjectId, workflowId: workflow._id });
  if (!node) {
    throw new NotFoundError('Không tìm thấy node trong workflow');
  }

  if (typeof payload.name !== 'undefined') node.name = payload.name;
  if (typeof payload.position !== 'undefined') node.position = payload.position;
  if (typeof payload.config !== 'undefined') node.config = payload.config;

  await node.save();

  return node;
};

export const deleteNode = async (userId, workflowId, nodeId) => {
  const { workflow } = await getWorkflowOwnershipContext(workflowId, userId);
  const nodeObjectId = toObjectId(nodeId, 'Node ID');

  const node = await WorkflowNode.findOne({ _id: nodeObjectId, workflowId: workflow._id });
  if (!node) {
    throw new NotFoundError('Không tìm thấy node trong workflow');
  }

  await Promise.all([
    WorkflowConnection.deleteMany({
      workflowId: workflow._id,
      $or: [{ sourceNodeId: nodeObjectId }, { targetNodeId: nodeObjectId }]
    }),
    WorkflowNode.deleteOne({ _id: nodeObjectId })
  ]);

  await updateWorkflowMetadata(workflow._id);

  return { message: 'Xóa node thành công' };
};

export const batchSaveNodes = async (userId, workflowId, payload = {}) => {
  const { workflow } = await getWorkflowOwnershipContext(workflowId, userId);

  const incomingNodes = Array.isArray(payload.nodes) ? payload.nodes : [];
  const existingNodes = await WorkflowNode.find({ workflowId: workflow._id }).lean();
  const existingNodeIds = new Set(existingNodes.map((node) => node._id.toString()));

  const retainedNodeIds = new Set();
  const processedNodeIds = [];

  for (const nodeInput of incomingNodes) {
    const safeData = {
      type: nodeInput.type,
      name: nodeInput.name,
      position: nodeInput.position,
      config: nodeInput.config || {}
    };

    if (nodeInput._id) {
      const nodeId = toObjectId(nodeInput._id, 'Node ID');
      const nodeIdString = nodeId.toString();

      if (!existingNodeIds.has(nodeIdString)) {
        throw new NotFoundError('Danh sách node chứa phần tử không tồn tại trong workflow');
      }

      await WorkflowNode.updateOne({ _id: nodeId, workflowId: workflow._id }, { $set: safeData });
      retainedNodeIds.add(nodeIdString);
      processedNodeIds.push(nodeIdString);
    } else {
      const createdNode = await WorkflowNode.create({
        ...safeData,
        workflowId: workflow._id
      });
      retainedNodeIds.add(createdNode._id.toString());
      processedNodeIds.push(createdNode._id.toString());
    }
  }

  const nodeIdsToDelete = [...existingNodeIds].filter((id) => !retainedNodeIds.has(id));
  if (nodeIdsToDelete.length) {
    const objectIds = nodeIdsToDelete.map((id) => new mongoose.Types.ObjectId(id));
    await Promise.all([
      WorkflowNode.deleteMany({ _id: { $in: objectIds }, workflowId: workflow._id }),
      WorkflowConnection.deleteMany({
        workflowId: workflow._id,
        $or: [
          { sourceNodeId: { $in: objectIds } },
          { targetNodeId: { $in: objectIds } }
        ]
      })
    ]);
  }

  await updateWorkflowMetadata(workflow._id);

  const finalNodes = await WorkflowNode.find({ workflowId: workflow._id }).lean();
  const nodeMap = new Map(finalNodes.map(n => [n._id.toString(), n]));

  return processedNodeIds.map(id => nodeMap.get(id)).filter(Boolean);
};

export const createConnection = async (userId, workflowId, payload) => {
  const { workflow } = await getWorkflowOwnershipContext(workflowId, userId);

  const sourceNodeId = toObjectId(payload.sourceNodeId, 'Source node ID');
  const targetNodeId = toObjectId(payload.targetNodeId, 'Target node ID');

  if (sourceNodeId.toString() === targetNodeId.toString()) {
    throw new BadRequestError('Không thể nối node với chính nó');
  }

  const nodes = await WorkflowNode.find({
    workflowId: workflow._id,
    _id: { $in: [sourceNodeId, targetNodeId] }
  }).lean();

  if (nodes.length !== 2) {
    throw new BadRequestError('Node nguồn hoặc node đích không thuộc workflow');
  }

  const sourcePort = payload.sourcePort || 'default';
  const targetPort = payload.targetPort || 'input';

  let connection;

  try {
    [connection] = await WorkflowConnection.create([
      {
        workflowId: workflow._id,
        sourceNodeId,
        sourcePort,
        targetNodeId,
        targetPort
      }
    ]);
  } catch (error) {
    if (error?.code === 11000) {
      throw new BadRequestError('Kết nối đã tồn tại');
    }
    throw error;
  }

  await updateWorkflowMetadata(workflow._id);

  return connection;
};

export const deleteConnection = async (userId, workflowId, connectionId) => {
  const { workflow } = await getWorkflowOwnershipContext(workflowId, userId);
  const connectionObjectId = toObjectId(connectionId, 'Connection ID');

  const deleted = await WorkflowConnection.findOneAndDelete({
    _id: connectionObjectId,
    workflowId: workflow._id
  });

  if (!deleted) {
    throw new NotFoundError('Không tìm thấy kết nối trong workflow');
  }

  await updateWorkflowMetadata(workflow._id);

  return { message: 'Xóa kết nối thành công' };
};

export const batchSaveConnections = async (userId, workflowId, payload = {}) => {
  const { workflow } = await getWorkflowOwnershipContext(workflowId, userId);

  const connectionsInput = Array.isArray(payload.connections) ? payload.connections : [];

  const workflowNodes = await WorkflowNode.find({ workflowId: workflow._id }).select('_id').lean();
  const nodeIdSet = new Set(workflowNodes.map((node) => node._id.toString()));

  const connectionDocs = [];
  const dedupSet = new Set();

  for (const item of connectionsInput) {
    const sourceNodeId = toObjectId(item.sourceNodeId, 'Source node ID');
    const targetNodeId = toObjectId(item.targetNodeId, 'Target node ID');

    const sourceKey = sourceNodeId.toString();
    const targetKey = targetNodeId.toString();

    if (!nodeIdSet.has(sourceKey) || !nodeIdSet.has(targetKey)) {
      throw new BadRequestError('Danh sách kết nối chứa node không thuộc workflow');
    }

    if (sourceKey === targetKey) {
      throw new BadRequestError('Không thể nối node với chính nó');
    }

    const sourcePort = item.sourcePort || 'default';
    const targetPort = item.targetPort || 'input';

    const dedupKey = `${sourceKey}:${sourcePort}:${targetKey}:${targetPort}`;
    if (dedupSet.has(dedupKey)) {
      continue;
    }
    dedupSet.add(dedupKey);

    connectionDocs.push({
      workflowId: workflow._id,
      sourceNodeId,
      sourcePort,
      targetNodeId,
      targetPort
    });
  }

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      await WorkflowConnection.deleteMany({ workflowId: workflow._id }, { session });

      if (connectionDocs.length) {
        await WorkflowConnection.insertMany(connectionDocs, { ordered: true, session });
      }

      await updateWorkflowMetadata(workflow._id, session);
    });
  } finally {
    await session.endSession();
  }

  return WorkflowConnection.find({ workflowId: workflow._id }).sort({ createdAt: 1 }).lean();
};

export const getExecutionHistory = async (userId, workflowId, query = {}) => {
  const { workflow } = await getWorkflowOwnershipContext(workflowId, userId);

  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);

  if (Number.isNaN(page) || page < 1 || Number.isNaN(limit) || limit < 1 || limit > 100) {
    throw new BadRequestError('Thông tin phân trang không hợp lệ');
  }

  const filter = { workflowId: workflow._id };

  if (query.applicationId) {
    filter.applicationId = toObjectId(query.applicationId, 'Application ID');
  }

  if (query.status) {
    filter.status = query.status;
  }

  const skip = (page - 1) * limit;

  const [items, totalItems] = await Promise.all([
    WorkflowExecution.find(filter)
      .sort({ executedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('applicationId', '_id status candidateName candidateEmail')
      .lean(),
    WorkflowExecution.countDocuments(filter)
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

export const getWorkflowTracking = async (userId, workflowId, jobId) => {
  const { workflow } = await getWorkflowOwnershipContext(workflowId, userId);

  const matchCondition = { workflowId: workflow._id };
  if (jobId) {
    matchCondition.jobId = toObjectId(jobId, 'Job ID');
  }

  const stats = await Application.aggregate([
    { $match: matchCondition },
    { $group: { _id: "$workflowData.currentNodeId", count: { $sum: 1 } } }
  ]);

  const result = stats.map(s => ({
    nodeId: s._id ? s._id.toString() : null,
    count: s.count
  }));

  return result;
};
