import { describe, it, expect } from 'vitest';
import {
  SETTINGS_BACKUP_FORMAT,
  SETTINGS_BACKUP_VERSION,
  SAFE_SETTING_KEYS,
  buildSettingsBackup,
  validateSettingsBackup,
} from '../settings-backup.js';

const settings = {
  theme: 'claude',
  tone: 'director',
  autoSave: true,
  aiGapMs: 1200,
  sktpgEnabled: true,
  partRouting: { core: 'anthropic:claude-opus-4-8' },
  anthropicModel: 'claude-opus-4-8',
  librarySort: 'recent',
  // secrets that MUST NOT be exported:
  anthropicKey: 'sk-ant-secret',
  anthropicRefresh: 'refresh-secret',
  xaiCredentials: { access_token: 'tok' },
  googleKey: 'AIza-secret',
};

describe('buildSettingsBackup', () => {
  it('exports only allowlisted keys — never secrets', () => {
    const b = buildSettingsBackup(settings, { exportedAt: '2026-06-13T00:00:00.000Z' });
    expect(b.format).toBe(SETTINGS_BACKUP_FORMAT);
    expect(b.version).toBe(SETTINGS_BACKUP_VERSION);
    expect(b.settings.theme).toBe('claude');
    expect(b.settings.partRouting).toEqual({ core: 'anthropic:claude-opus-4-8' });
    // none of the secrets leak
    expect(b.settings.anthropicKey).toBeUndefined();
    expect(b.settings.anthropicRefresh).toBeUndefined();
    expect(b.settings.xaiCredentials).toBeUndefined();
    expect(b.settings.googleKey).toBeUndefined();
    const json = JSON.stringify(b);
    expect(json).not.toMatch(/secret/);
    expect(json).not.toMatch(/sk-ant/);
  });
  it('omits keys that are absent', () => {
    const b = buildSettingsBackup({ theme: 'midnight' });
    expect(Object.keys(b.settings)).toEqual(['theme']);
  });
  it('round-trips through JSON back into a valid file', () => {
    const b = JSON.parse(JSON.stringify(buildSettingsBackup(settings, { exportedAt: 'x' })));
    const { ok, value } = validateSettingsBackup(b);
    expect(ok).toBe(true);
    expect(value.theme).toBe('claude');
  });
});

describe('validateSettingsBackup', () => {
  it('accepts a well-formed file and returns only allowlisted settings', () => {
    const res = validateSettingsBackup(buildSettingsBackup(settings));
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
    expect(SAFE_SETTING_KEYS).toContain('theme');
    expect(res.value.anthropicKey).toBeUndefined();
  });
  it('strips injected secret / unknown keys on import (allowlist guard)', () => {
    const tampered = {
      format: SETTINGS_BACKUP_FORMAT,
      version: 1,
      settings: { theme: 'paper', anthropicKey: 'sk-ant-injected', evil: true, __proto__: { polluted: 1 } },
    };
    const { ok, value } = validateSettingsBackup(tampered);
    expect(ok).toBe(true);
    expect(value).toEqual({ theme: 'paper' }); // only the allowlisted key survives
    expect(value.anthropicKey).toBeUndefined();
    expect(value.evil).toBeUndefined();
  });
  it('rejects non-objects and the wrong format', () => {
    expect(validateSettingsBackup(null).ok).toBe(false);
    expect(validateSettingsBackup([]).ok).toBe(false);
    expect(validateSettingsBackup({ format: 'nope', version: 1 }).ok).toBe(false);
  });
  it('rejects a newer-than-supported version', () => {
    const res = validateSettingsBackup({
      format: SETTINGS_BACKUP_FORMAT,
      version: SETTINGS_BACKUP_VERSION + 1,
    });
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/newer RepoLens/);
  });
  it('always returns a safe value object even on failure', () => {
    expect(validateSettingsBackup(undefined).value).toEqual({});
  });
});
