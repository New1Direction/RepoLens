// OpenRouter's public catalog is the source of truth for pricing and endpoint
// capabilities. RepoLens scans require a text-only model that can honor JSON mode.
export function isFreeStructuredOpenRouterTextModel(raw) {
  const input = raw?.architecture?.input_modalities;
  const output = raw?.architecture?.output_modalities;
  const supported = raw?.supported_parameters;
  const modelId = String(raw?.id || '').trim();

  return (
    modelId !== 'openrouter/free' &&
    Array.isArray(input) &&
    input.includes('text') &&
    Array.isArray(output) &&
    output.length === 1 &&
    output[0] === 'text' &&
    Number(raw?.pricing?.prompt) === 0 &&
    Number(raw?.pricing?.completion) === 0 &&
    Array.isArray(supported) &&
    supported.includes('response_format')
  );
}
