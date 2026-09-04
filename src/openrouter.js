// OpenRouter scan request contract. Kept pure so request-shape regressions do not
// require a browser service-worker test harness.
export const OPENROUTER_STRUCTURED_FREE_MODEL = 'z-ai/glm-5.2:free';
export const OPENROUTER_SCAN_MAX_TOKENS = 8192;

export function openRouterScanBody(model, prompt) {
  const selectedModel = model || OPENROUTER_STRUCTURED_FREE_MODEL;
  const body = {
    model: selectedModel,
    max_tokens: OPENROUTER_SCAN_MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  };
  if (selectedModel === OPENROUTER_STRUCTURED_FREE_MODEL) {
    body.response_format = { type: 'json_object' };
  }
  return body;
}

export function isTruncatedOpenRouterResponse(data) {
  return data?.choices?.[0]?.finish_reason === 'length';
}
