import { describe, it, expect } from 'vitest';
import {
  introStageA,
  introStageB,
  milestoneSteps,
  shouldOfferMilestone,
  MILESTONE_AT,
} from '../onboarding.js';

describe('onboarding step lists', () => {
  it('intro stages are non-empty, reference real copy keys + selectors', () => {
    for (const list of [introStageA(), introStageB(), milestoneSteps()]) {
      expect(list.length).toBeGreaterThan(0);
      for (const s of list) {
        expect(typeof s.copyKey).toBe('string');
        expect('target' in s).toBe(true);
      }
    }
  });
  it('milestone offers at the threshold, not before, and not once seen', () => {
    expect(
      shouldOfferMilestone({ realCount: MILESTONE_AT, milestoneTourSeen: false, onboardingSeen: true })
    ).toBe(true);
    expect(
      shouldOfferMilestone({ realCount: MILESTONE_AT - 1, milestoneTourSeen: false, onboardingSeen: true })
    ).toBe(false);
    expect(
      shouldOfferMilestone({ realCount: MILESTONE_AT + 9, milestoneTourSeen: true, onboardingSeen: true })
    ).toBe(false);
    expect(
      shouldOfferMilestone({ realCount: MILESTONE_AT, milestoneTourSeen: false, onboardingSeen: false })
    ).toBe(false);
  });
});
