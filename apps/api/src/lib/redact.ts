/**
 * Secret redaction for log lines.
 *
 * The pipeline logs raw subprocess output and external API errors
 * into the run_log table; SSE relays those lines to the browser.
 * If a key snuck into an error payload (yt-dlp echoing a URL with
 * tokens, the LLM SDK including the bearer header in its error
 * message), the run page would render it.
 *
 * This module catches the common shapes — bearer headers, OpenAI
 * `sk-` keys, Anthropic `sk-ant-` keys, generic high-entropy
 * tokens — and replaces them with a placeholder.
 */

const PATTERNS: { pattern: RegExp; replacement: string }[] = [
  // Authorization: Bearer <token>
  {
    pattern: /(authorization:\s*bearer\s+)([A-Za-z0-9._\-+/=]+)/gi,
    replacement: '$1<redacted>',
  },
  // Plain bearer header value, common in copied curl logs
  { pattern: /bearer\s+[A-Za-z0-9._\-+/=]{20,}/gi, replacement: 'bearer <redacted>' },
  // Anthropic API keys MUST run before the OpenAI pattern; otherwise
  // `sk-ant-…` matches the OpenAI rule first and the prefix is lost.
  { pattern: /sk-ant-[A-Za-z0-9_-]{20,}/g, replacement: 'sk-ant-<redacted>' },
  // OpenAI API keys
  { pattern: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g, replacement: 'sk-<redacted>' },
  // Tavily keys
  { pattern: /tvly-[A-Za-z0-9]{20,}/g, replacement: 'tvly-<redacted>' },
  // Brave subscription tokens (BSA prefix)
  { pattern: /BSA[A-Za-z0-9_-]{20,}/g, replacement: 'BSA<redacted>' },
  // Generic header in JSON error payloads: "Authorization":"Bearer ..."
  {
    pattern: /("authorization"\s*:\s*"bearer\s+)([^"]+)("\s*)/gi,
    replacement: '$1<redacted>$3',
  },
  // X-Api-Key style headers
  {
    pattern: /(x-(?:api-)?key:\s*)([A-Za-z0-9._\-+/=]{12,})/gi,
    replacement: '$1<redacted>',
  },
];

/** Remove credentials from a single log line. Pure function. */
export function redactSecrets(line: string): string {
  let out = line;
  for (const { pattern, replacement } of PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}
