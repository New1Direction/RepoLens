// onboarding.js
// Pure building blocks for the Vee onboarding tours: step lists + the milestone gate.
// (DOM trigger wrappers live in library.js / output-tab.js where they read
// chrome.storage and call the coachmark engine.)
import { COPY } from './onboarding-copy.js';

export const MILESTONE_AT = 5;

// Each step: { target (CSS selector or null=center), copyKey, mascotState, before? }
export function introStageA() {
  return [
    { target: null, copyKey: 'introGreet', mascotState: 'idle' },
    { target: '[data-node-demo], #grid .lib-card', copyKey: 'introCard', mascotState: 'idle' },
    { target: '#lib-btn-corkboard', copyKey: 'introCorkboard', mascotState: 'thinking' },
    { target: '#search', copyKey: 'introSearch', mascotState: 'idle' },
    { target: '#grid .lib-card', copyKey: 'introOpen', mascotState: 'idle' },
  ];
}
export function introStageB() {
  return [
    { target: '.v-fit, .lc-chip', copyKey: 'verdict', mascotState: 'strong' },
    { target: '[data-tab="27"]', copyKey: 'blueprint', mascotState: 'thinking' },
    { target: null, copyKey: 'farewell', mascotState: 'idle' },
  ];
}
export function milestoneSteps() {
  return [
    { target: '#ask-input', copyKey: 'milestoneAsk', mascotState: 'idle' },
    { target: '#lib-btn-corkboard', copyKey: 'milestoneCorkboard', mascotState: 'thinking' },
    { target: '#select', copyKey: 'milestoneCompare', mascotState: 'idle' },
    { target: '#lib-btn-radar', copyKey: 'milestoneOrganize', mascotState: 'idle' },
    { target: '#discover-btn', copyKey: 'milestoneDiscover', mascotState: 'idle' },
  ];
}

/** Pure gate for the milestone offer. */
export function shouldOfferMilestone({ realCount, milestoneTourSeen, onboardingSeen }) {
  return !!onboardingSeen && !milestoneTourSeen && realCount >= MILESTONE_AT;
}

export { COPY };
