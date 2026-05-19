import crypto from 'crypto';

const sessions = new Map();

const cloneSession = (session) => structuredClone(session);

export const createAnalysisSession = ({ applicationId, userId }) => {
  const now = Date.now();
  const analysisId = crypto.randomUUID();

  const session = {
    analysisId,
    applicationId,
    userId,
    status: 'started',
    matchScore: 0,
    analysisProgress: 0,
    phaseLabel: 'Khoi tao phan tich',
    sections: {},
    events: [],
    createdAt: now,
    updatedAt: now,
  };

  sessions.set(analysisId, session);
  return cloneSession(session);
};

export const pushAnalysisEvent = (analysisId, event = {}) => {
  const session = sessions.get(analysisId);
  if (!session) {
    return null;
  }

  const now = Date.now();
  const storedEvent = {
    ...event,
    timestamp: event.timestamp ?? now,
  };

  if (Number.isFinite(event.matchScore)) {
    session.matchScore = event.matchScore;
  }

  if (Number.isFinite(event.analysisProgress)) {
    session.analysisProgress = event.analysisProgress;
  }

  if (typeof event.phaseLabel === 'string' && event.phaseLabel) {
    session.phaseLabel = event.phaseLabel;
  }

  if (event.sections && typeof event.sections === 'object') {
    session.sections = {
      ...session.sections,
      ...event.sections,
    };
  }

  if (typeof event.status === 'string' && event.status) {
    session.status = event.status;
  } else if (event.type === 'completed') {
    session.status = 'completed';
  } else if (event.type === 'error') {
    session.status = 'error';
  }

  session.events.push(storedEvent);
  session.updatedAt = now;

  return cloneSession(session);
};

export const getLatestAnalysisState = (analysisId) => {
  const session = sessions.get(analysisId);
  if (!session) {
    return null;
  }

  return cloneSession(session);
};
