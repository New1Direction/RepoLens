// settings-backup.js — pure transforms for exporting / importing RepoLens
// settings (theme, tone, model picks, routing, etc.) as a portable JSON file.
//
// Security by construction: an ALLOWLIST drives both directions, so API keys,
// OAuth tokens, and credentials are never written to an export and never applied
// from an import — a settings file is always safe to share or sync. No chrome,
// no DOM; the IO glue lives in options.js.

export const SETTINGS_BACKUP_FORMAT = 'repolens-settings';
export const SETTINGS_BACKUP_VERSION = 1;

/** The only keys that ever cross the export/import boundary. Anything not here
 *  — every *Key, *Refresh, *Credentials, *Expiry secret — is excluded. */
export const SAFE_SETTING_KEYS = [
  'theme',
  'tone',
  'autoSave',
  'aiGapMs',
  'sktpgEnabled',
  'mascotEnabled',
  'partRouting',
  'anthropicModel',
  'googleModel',
  'openrouterModel',
  'xaiModel',
  'nousModel',
  'librarySort',
  'canvasEnabled',
  'canvasTourAutoplay',
  // Onboarding flags — backed up together so a settings restore never lands in a
  // half-onboarded state. All booleans, no secrets.
  'onboardingSeen',
  'milestoneTourSeen',
  'milestoneSnoozeAt10',
];

const pickSafe = (src) => {
  const out = {};
  if (src && typeof src === 'object') {
    for (const k of SAFE_SETTING_KEYS) if (src[k] !== undefined) out[k] = src[k];
  }
  return out;
};

/**
 * Build a versioned settings envelope from a chrome.storage.local snapshot.
 * Only allowlisted (non-secret) keys are included. `exportedAt` is injectable
 * for deterministic tests.
 * @param {object} settings
 * @param {{ exportedAt?: string }} [opts]
 * @returns {object}
 */
export function buildSettingsBackup(settings, { exportedAt } = {}) {
  return {
    format: SETTINGS_BACKUP_FORMAT,
    version: SETTINGS_BACKUP_VERSION,
    exportedAt: exportedAt || new Date().toISOString(),
    settings: pickSafe(settings),
  };
}

/**
 * Validate a parsed settings file and return the allowlisted settings to apply.
 * Never throws; `value` is always a safe object containing only known keys, so a
 * tampered file (with injected `anthropicKey`, `__proto__`, etc.) can't apply a
 * secret or an unknown key.
 * @param {unknown} obj
 * @returns {{ ok: boolean, errors: string[], value: object }}
 */
export function validateSettingsBackup(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, errors: ['Not a RepoLens settings file (empty or not a JSON object).'], value: {} };
  }
  if (obj.format !== SETTINGS_BACKUP_FORMAT) {
    errors.push(`Unrecognized file — expected a "${SETTINGS_BACKUP_FORMAT}" export.`);
  }
  const version = Number(obj.version);
  if (!Number.isFinite(version) || version < 1) {
    errors.push('Missing or invalid settings version.');
  } else if (version > SETTINGS_BACKUP_VERSION) {
    errors.push(`This settings file is from a newer RepoLens (v${version}); update the extension to import it.`);
  }
  return { ok: errors.length === 0, errors, value: pickSafe(obj.settings) };
}
