import { describe, it, expect } from 'vitest';
import { providerSupportsEmbeddings, compatEmbeddingsEndpoint, embeddingsModelFor } from '../providers.js';

describe('embeddings capability', () => {
  it('openai supports embeddings when connected (has a key)', () => {
    expect(providerSupportsEmbeddings('openai', { openaiKey: 'sk-x' })).toBe(true);
    expect(providerSupportsEmbeddings('openai', {})).toBe(false);       // no key → not connected
  });
  it('a provider without an embeddings model does not support it', () => {
    expect(providerSupportsEmbeddings('groq', { groqKey: 'x' })).toBe(false);
  });
  it('derives the /embeddings endpoint from the chat endpoint', () => {
    expect(compatEmbeddingsEndpoint('openai', {})).toBe('https://api.openai.com/v1/embeddings');
  });
  it('embeddingsModelFor prefers an override then the default', () => {
    expect(embeddingsModelFor('openai', {})).toBe('text-embedding-3-small');
    expect(embeddingsModelFor('openai', { openaiEmbedModel: 'text-embedding-3-large' })).toBe('text-embedding-3-large');
  });
});
