import { describe, it, expect } from '@jest/globals';
import {
  createAnalysisSession,
  pushAnalysisEvent,
  getLatestAnalysisState,
} from '../../src/services/cvScoreStream.service.js';

describe('cvScoreStream.service', () => {
  it('creates session with started state', () => {
    const session = createAnalysisSession({ applicationId: 'app1', userId: 'u1' });

    expect(session.analysisId).toBeTruthy();
    expect(session.applicationId).toBe('app1');
    expect(session.userId).toBe('u1');
    expect(session.status).toBe('started');
    expect(session.matchScore).toBe(0);
    expect(session.analysisProgress).toBe(0);
    expect(session.phaseLabel).toBe('Khoi tao phan tich');
    expect(session.sections).toEqual({});
    expect(session.events).toEqual([]);
    expect(session.createdAt).toEqual(expect.any(Number));
    expect(session.updatedAt).toEqual(expect.any(Number));
  });

  it('stores latest score progress sections and events', () => {
    const { analysisId } = createAnalysisSession({ applicationId: 'app1', userId: 'u1' });

    pushAnalysisEvent(analysisId, { type: 'score_update', matchScore: 68 });
    pushAnalysisEvent(analysisId, { type: 'progress_update', analysisProgress: 40, phaseLabel: 'Dang phan tich' });
    pushAnalysisEvent(analysisId, {
      type: 'section_update',
      sections: {
        skillFit: { score: 70, summary: 'Skill fit tot' },
      },
    });

    const latest = getLatestAnalysisState(analysisId);

    expect(latest.matchScore).toBe(68);
    expect(latest.analysisProgress).toBe(40);
    expect(latest.phaseLabel).toBe('Dang phan tich');
    expect(latest.sections).toEqual({
      skillFit: { score: 70, summary: 'Skill fit tot' },
    });
    expect(latest.events).toHaveLength(3);
    expect(latest.events[0]).toMatchObject({ type: 'score_update', matchScore: 68 });
    expect(latest.events[2]).toMatchObject({ type: 'section_update' });
    expect(latest.updatedAt).toBeGreaterThanOrEqual(latest.createdAt);
  });

  it('returns null when session does not exist', () => {
    expect(getLatestAnalysisState('missing-analysis-id')).toBeNull();
  });

  it('returns null when pushing event to missing session', () => {
    expect(pushAnalysisEvent('missing-analysis-id', { type: 'progress_update' })).toBeNull();
  });

  it('merges section updates across multiple events', () => {
    const { analysisId } = createAnalysisSession({ applicationId: 'app2', userId: 'u2' });

    pushAnalysisEvent(analysisId, {
      type: 'section_update',
      sections: {
        skillFit: { score: 60, summary: 'Tam on' },
      },
    });

    pushAnalysisEvent(analysisId, {
      type: 'section_update',
      sections: {
        experienceFit: { score: 75, summary: 'Kinh nghiem phu hop' },
      },
    });

    const latest = getLatestAnalysisState(analysisId);

    expect(latest.sections).toEqual({
      skillFit: { score: 60, summary: 'Tam on' },
      experienceFit: { score: 75, summary: 'Kinh nghiem phu hop' },
    });
  });

  it('returns defensive copies so external mutation does not affect internal state', () => {
    const { analysisId } = createAnalysisSession({ applicationId: 'app3', userId: 'u3' });

    const sessionAfterEvent = pushAnalysisEvent(analysisId, {
      type: 'section_update',
      sections: {
        skillFit: { score: 70, summary: 'On dinh' },
      },
    });

    sessionAfterEvent.sections.skillFit.score = 1;
    sessionAfterEvent.events.push({ type: 'tampered' });

    const latest = getLatestAnalysisState(analysisId);

    expect(latest.sections.skillFit.score).toBe(70);
    expect(latest.events).toHaveLength(1);
    expect(latest.events[0]).toMatchObject({ type: 'section_update' });
  });
});
