import { describe, expect, it } from 'vitest';
import { RegisterInputSchema } from '../src/api.js';
import {
  LlmSettingsSchema,
  SearchSettingsSchema,
  TranscriptionSettingsSchema,
} from '../src/settings.js';

describe('RegisterInputSchema', () => {
  it('requires matching password confirmation', () => {
    const r = RegisterInputSchema.safeParse({
      username: 'admin',
      password: 'correct-horse-battery',
      password_confirmation: 'wrong-confirmation-value',
    });
    expect(r.success).toBe(false);
  });

  it('rejects short usernames', () => {
    const r = RegisterInputSchema.safeParse({
      username: 'ab',
      password: 'long-enough-password',
      password_confirmation: 'long-enough-password',
    });
    expect(r.success).toBe(false);
  });

  it('rejects illegal characters in username', () => {
    const r = RegisterInputSchema.safeParse({
      username: 'with space',
      password: 'long-enough-password',
      password_confirmation: 'long-enough-password',
    });
    expect(r.success).toBe(false);
  });

  it('accepts a valid registration', () => {
    const r = RegisterInputSchema.safeParse({
      username: 'bintang',
      password: 'long-enough-password',
      password_confirmation: 'long-enough-password',
    });
    expect(r.success).toBe(true);
  });
});

describe('TranscriptionSettingsSchema', () => {
  it('defaults local model to base', () => {
    const r = TranscriptionSettingsSchema.parse({ backend: 'local' });
    expect(r.backend).toBe('local');
    if (r.backend === 'local') expect(r.model).toBe('base');
  });

  it('requires a base_url for openai_compatible', () => {
    const r = TranscriptionSettingsSchema.safeParse({
      backend: 'openai_compatible',
      api_key: 'sk-x',
      model: 'whisper-1',
    });
    expect(r.success).toBe(false);
  });
});

describe('LlmSettingsSchema', () => {
  it('requires base_url on openai_compatible profiles', () => {
    const r = LlmSettingsSchema.safeParse({
      primary: {
        id: '00000000-0000-4000-8000-000000000099',
        label: 'Custom',
        provider: 'openai_compatible',
        preset: 'custom',
        api_key: 'sk-x',
        model: 'gpt-4o',
      },
      fallbacks: [],
    });
    expect(r.success).toBe(false);
  });
});

describe('SearchSettingsSchema', () => {
  it('accepts the disabled marker', () => {
    const r = SearchSettingsSchema.parse({ disabled: true });
    expect(r.disabled).toBe(true);
  });

  it('accepts a Tavily-only configuration', () => {
    const r = SearchSettingsSchema.parse({
      disabled: false,
      main: { provider: 'tavily', api_key: 'tvly-x' },
    });
    expect(r.disabled).toBe(false);
  });
});
