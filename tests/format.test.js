import { describe, it, expect } from 'vitest';
import { esc, paras, formatStars } from '../format.js';

describe('esc', () => {
  it('escapes HTML-significant characters', () => {
    expect(esc('<script>"&"</script>')).toBe('&lt;script&gt;&quot;&amp;&quot;&lt;/script&gt;');
  });
  it('escapes single quotes too (attribute-safe, matches safe-html escapeHtml)', () => {
    expect(esc("O'Brien")).toBe('O&#39;Brien');
  });
  it('handles null/undefined', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});

describe('paras', () => {
  it('splits blank-line-separated text into <p> blocks', () => {
    expect(paras('one\n\ntwo', 'body-text')).toBe('<p class="body-text">one</p><p class="body-text">two</p>');
  });
  it('keeps a single paragraph as one block', () => {
    expect(paras('just one', 'big-text')).toBe('<p class="big-text">just one</p>');
  });
  it('converts single newlines within a paragraph to <br>', () => {
    expect(paras('line1\nline2', 'x')).toBe('<p class="x">line1<br>line2</p>');
  });
  it('escapes content', () => {
    expect(paras('<b>', 'x')).toBe('<p class="x">&lt;b&gt;</p>');
  });
  it('returns empty string for empty/whitespace input', () => {
    expect(paras('', 'x')).toBe('');
    expect(paras('   \n\n  ', 'x')).toBe('');
    expect(paras(null, 'x')).toBe('');
  });
});

describe('formatStars', () => {
  it('returns null for zero/falsy', () => {
    expect(formatStars(0)).toBeNull();
    expect(formatStars(undefined)).toBeNull();
  });
  it('shows raw count under 1000', () => {
    expect(formatStars(850)).toBe('850');
    expect(formatStars(1)).toBe('1');
  });
  it('formats thousands with one decimal under 10k, dropping trailing .0', () => {
    expect(formatStars(1234)).toBe('1.2k');
    expect(formatStars(1500)).toBe('1.5k');
    expect(formatStars(2000)).toBe('2k');
  });
  it('rounds to whole k at 10k and above', () => {
    expect(formatStars(15000)).toBe('15k');
    expect(formatStars(123456)).toBe('123k');
  });
  it('formats millions', () => {
    expect(formatStars(1_200_000)).toBe('1.2M');
    expect(formatStars(15_000_000)).toBe('15M');
  });
});
