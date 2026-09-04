import { describe, expect, it } from 'vitest';
import { isFreeStructuredOpenRouterTextModel } from '../src/openrouter-catalog.js';

const freeStructuredText = {
  id: 'z-ai/glm-5.2:free',
  architecture: { input_modalities: ['text'], output_modalities: ['text'] },
  pricing: { prompt: '0', completion: '0' },
  supported_parameters: ['response_format', 'structured_outputs'],
};

describe('isFreeStructuredOpenRouterTextModel', () => {
  it('accepts a zero-priced text model that advertises JSON response format', () => {
    expect(isFreeStructuredOpenRouterTextModel(freeStructuredText)).toBe(true);
  });

  it('rejects paid, generic-router, audio-output, and unstructured models', () => {
    expect(
      isFreeStructuredOpenRouterTextModel({
        ...freeStructuredText,
        pricing: { prompt: '0', completion: '0.1' },
      })
    ).toBe(false);
    expect(isFreeStructuredOpenRouterTextModel({ ...freeStructuredText, id: 'openrouter/free' })).toBe(false);
    expect(
      isFreeStructuredOpenRouterTextModel({
        ...freeStructuredText,
        architecture: { input_modalities: ['text'], output_modalities: ['text', 'audio'] },
      })
    ).toBe(false);
    expect(isFreeStructuredOpenRouterTextModel({ ...freeStructuredText, supported_parameters: [] })).toBe(
      false
    );
  });
});
