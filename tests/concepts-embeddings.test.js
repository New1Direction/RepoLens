import { describe, it, expect } from 'vitest';
import { providerSupportsEmbeddings, compatEmbeddingsEndpoint, embeddingsModelFor } from '../providers.js';
import { embeddingsBody, parseEmbeddings, compatStorageKeys } from '../providers.js';

describe('embeddings capability', () => {
  it('openai supports embeddings when connected (has a key)', () => {
    expect(providerSupportsEmbeddings('openai', { openaiKey: 'sk-x' })).toBe(true);
    expect(providerSupportsEmbeddings('openai', {})).toBe(false); // no key → not connected
  });
  it('a provider without an embeddings model does not support it', () => {
    expect(providerSupportsEmbeddings('groq', { groqKey: 'x' })).toBe(false);
  });
  it('derives the /embeddings endpoint from the chat endpoint', () => {
    expect(compatEmbeddingsEndpoint('openai', {})).toBe('https://api.openai.com/v1/embeddings');
  });
  it('embeddingsModelFor prefers an override then the default', () => {
    expect(embeddingsModelFor('openai', {})).toBe('text-embedding-3-small');
    expect(embeddingsModelFor('openai', { openaiEmbedModel: 'text-embedding-3-large' })).toBe(
      'text-embedding-3-large'
    );
  });
  it('exposes the embeddings-model override slot so it actually loads at runtime', () => {
    // Without this, keys[`${id}EmbedModel`] is never read and the override is a no-op.
    expect(compatStorageKeys()).toContain('openaiEmbedModel');
  });
});

describe('embeddings body + parse', () => {
  it('builds the request body', () => {
    expect(embeddingsBody('text-embedding-3-small', ['a', 'b'])).toEqual({
      model: 'text-embedding-3-small',
      input: ['a', 'b'],
    });
  });
  it('parses vectors ordered by index', () => {
    const json = {
      data: [
        { index: 1, embedding: [3, 4] },
        { index: 0, embedding: [1, 2] },
      ],
    };
    expect(parseEmbeddings(json)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
});
