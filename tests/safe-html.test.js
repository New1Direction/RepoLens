import { describe, it, expect } from 'vitest';
import { escapeHtml, raw, html } from '../safe-html.js';

describe('escapeHtml', () => {
  it('escapes all five HTML-significant characters', () => {
    expect(escapeHtml('& < > " \'')).toBe('&amp; &lt; &gt; &quot; &#39;');
  });
  it('escapes quotes so attribute contexts cannot be broken out of', () => {
    // The whole point: a value used in title="..." cannot close the attribute.
    expect(escapeHtml('" onmouseover="alert(1)')).not.toContain('"');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#39;');
  });
  it('coerces null/undefined to an empty string (never "null"/"undefined")', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
  it('coerces non-strings', () => {
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(0)).toBe('0');
  });
  it('leaves safe text untouched', () => {
    expect(escapeHtml('facebook/react')).toBe('facebook/react');
  });
});

describe('html tagged template', () => {
  it('escapes interpolated values in text context', () => {
    const out = String(html`<p>${'<script>alert(1)</script>'}</p>`);
    expect(out).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });
  it('escapes interpolated values in attribute context (no breakout)', () => {
    const evil = '"><img src=x onerror=alert(1)>';
    const out = String(html`<a title="${evil}">link</a>`);
    expect(out).not.toContain('<img');
    expect(out).toContain('&quot;&gt;&lt;img');
  });
  it('joins arrays of values', () => {
    const out = String(
      html`<ul>
        ${['a', 'b', 'c'].map((x) => html`<li>${x}</li>`)}
      </ul>`
    );
    expect(out.replace(/\s+/g, '')).toBe('<ul><li>a</li><li>b</li><li>c</li></ul>');
  });
  it('passes raw()/nested html`` through without double-escaping', () => {
    const inner = html`<b>${'A & B'}</b>`;
    const out = String(html`<p>${inner}</p>`);
    expect(out).toBe('<p><b>A &amp; B</b></p>');
  });
  it('renders null/undefined/false as empty (conditional fragments)', () => {
    expect(String(html`<x>${null}${undefined}${false}</x>`)).toBe('<x></x>');
  });
  it('result coerces to a string when assigned/templated', () => {
    expect(`${html`<i>${'x'}</i>`}`).toBe('<i>x</i>');
  });
});

describe('raw', () => {
  it('marks a string as trusted so html`` emits it verbatim', () => {
    const out = String(html`<div>${raw('<hr>')}</div>`);
    expect(out).toBe('<div><hr></div>');
  });
  it('is idempotent on an existing raw value', () => {
    const r = raw('<hr>');
    expect(String(html`${raw(r)}`)).toBe('<hr>');
  });
});
