import { describe, expect, it } from 'vitest';
import { redactSecrets } from '../src/lib/redact.js';

describe('redactSecrets', () => {
  it('replaces OpenAI keys', () => {
    expect(redactSecrets('using sk-ABC123def456ghi789jkl012mno')).toBe('using sk-<redacted>');
    expect(redactSecrets('sk-proj-AaBbCc1234567890dEeFfGgHhIi')).toBe('sk-<redacted>');
  });

  it('replaces Anthropic keys', () => {
    expect(redactSecrets('hi sk-ant-AbCdEfGhIjKl1234567890mnopqrst')).toBe('hi sk-ant-<redacted>');
  });

  it('replaces Tavily keys', () => {
    expect(redactSecrets('tvly-abc123DEF456GHI789jklMNO')).toBe('tvly-<redacted>');
  });

  it('replaces Brave subscription tokens', () => {
    expect(redactSecrets('BSAabcdef1234567890ABCDEFGH')).toBe('BSA<redacted>');
  });

  it('strips bearer headers', () => {
    expect(redactSecrets('Authorization: Bearer ABCdef1234567890XYZ')).toBe(
      'Authorization: Bearer <redacted>',
    );
    expect(redactSecrets('curl -H "authorization: bearer abcdefghijklmnopqrstuv"')).toBe(
      'curl -H "authorization: bearer <redacted>"',
    );
  });

  it('strips x-api-key style headers', () => {
    expect(redactSecrets('X-API-KEY: my-very-secret-token-xx')).toBe('X-API-KEY: <redacted>');
  });

  it('leaves harmless text alone', () => {
    expect(redactSecrets('rendered longform 1/3: My clip title')).toBe(
      'rendered longform 1/3: My clip title',
    );
  });
});
