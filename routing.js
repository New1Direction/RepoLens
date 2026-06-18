// Pure model-routing logic: given the user's per-part routing config and which providers
// are connected, produce the ordered list of (provider, model) attempts for a scan part.
// No DOM, no network, no chrome — unit-tested. background.js executes the plan.

import { COMPAT_PROVIDERS, isCompatConnected, compatModelFor } from './providers.js';
import { canonicalModel } from './models.js';

// The global fallback order (cheap/fast first → strongest last), matching the legacy chain.
// These five are the "first-class" providers (bespoke OAuth / quirks). Registry providers
// (providers.js) are appended after the chain so connecting only one of them still works.
export const CHAIN = ['nous', 'google', 'openrouter', 'xai', 'anthropic'];

// Each provider's default model when the user hasn't overridden it (mirrors the callX defaults).
export const DEFAULT_MODELS = {
  nous: 'stepfun/step-3.7-flash',
  google: 'gemini-3.1-pro-preview',
  openrouter: 'x-ai/grok-4.3',
  xai: 'grok-4.3',
  anthropic: 'claude-sonnet-4-6',
};

/** Is a provider usable right now (has a key / refresh token)? Registry providers defer to providers.js. */
export function isConnected(provider, keys = {}) {
  switch (provider) {
    case 'nous':
      return !!keys.nousKey;
    case 'google':
      return !!keys.googleKey;
    case 'openrouter':
      return !!keys.openrouterKey;
    case 'xai':
      return !!(keys.xaiKey || keys.xaiRefresh);
    case 'anthropic':
      return !!(keys.anthropicKey || keys.anthropicAccess || keys.anthropicRefresh);
    default:
      return isCompatConnected(provider, keys);
  }
}

/** The provider's configured model, falling back to its hardcoded/registry default. */
export function modelFor(provider, keys = {}) {
  if (provider in DEFAULT_MODELS) {
    const configured = {
      nous: keys.nousModel,
      google: keys.googleModel,
      openrouter: keys.openrouterModel,
      xai: keys.xaiModel,
      anthropic: keys.anthropicModel,
    }[provider];
    return canonicalModel(provider, configured || DEFAULT_MODELS[provider]);
  }
  return compatModelFor(provider, keys); // registry provider
}

/**
 * Ordered, de-duplicated list of { provider, model } to try for `part`:
 * the per-part override (if set + connected) first, then the global chain as fallback.
 * Only connected providers appear. Empty array if nothing is connected.
 */
export function buildAttemptPlan({ routing = {}, part, keys = {} }) {
  const plan = [];
  const seen = new Set();
  const push = (provider, model) => {
    if (!isConnected(provider, keys)) return;
    const m = canonicalModel(provider, model || modelFor(provider, keys));
    if (!m) return; // no resolvable model (e.g. a registry provider whose model isn't set yet)
    const k = `${provider}:${m}`;
    if (seen.has(k)) return;
    seen.add(k);
    plan.push({ provider, model: m });
  };

  const override = part && routing[part];
  if (override && override !== 'default') {
    const i = override.indexOf(':');
    if (i > 0) push(override.slice(0, i), override.slice(i + 1));
  }
  for (const p of CHAIN) push(p, modelFor(p, keys));
  // Any connected registry provider is a valid fallback too — so a user who connects
  // only (say) DeepSeek still gets a usable plan when no per-part override is set.
  for (const p of COMPAT_PROVIDERS) push(p.id, compatModelFor(p.id, keys));
  return plan;
}
