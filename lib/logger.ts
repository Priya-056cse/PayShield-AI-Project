/**
 * PayShield AI - Masked Logging Utility
 * Ensures emails, API keys, tokens, and payment card sequences are masked in logs.
 */

const EMAIL_REGEX = /\b([a-zA-Z0-9_.+-])[a-zA-Z0-9_.+-]*@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)\b/g;
const BEARER_REGEX = /Bearer\s+[a-zA-Z0-9_\-\.]+/gi;
const OPENAI_KEY_REGEX = /sk-[a-zA-Z0-9_\-]{20,}/g;
const CARD_DIGITS_REGEX = /\b(?:\d[ -]*?){13,19}\b/g;

/**
 * Mask sensitive patterns within any string.
 * - Emails: user@example.com -> u***@example.com
 * - Bearer tokens: Bearer xxx -> Bearer [MASKED]
 * - API keys: sk-xxx -> sk-***[MASKED]
 * - Card / Long digit sequences: 4111... -> [MASKED_DIGITS]
 */
export function maskSensitive(text: unknown): string {
  if (typeof text !== "string") {
    try {
      return maskSensitive(JSON.stringify(text));
    } catch {
      return String(text);
    }
  }

  return text
    .replace(EMAIL_REGEX, "$1***@$2")
    .replace(BEARER_REGEX, "Bearer [MASKED]")
    .replace(OPENAI_KEY_REGEX, "sk-***[MASKED]")
    .replace(CARD_DIGITS_REGEX, "[MASKED_DIGITS]");
}

/**
 * Safe logger that automatically masks arguments.
 */
export const logger = {
  info(message: string, ...meta: unknown[]): void {
    const maskedMeta = meta.map(maskSensitive);
    console.log(`[PayShield AI:INFO] ${maskSensitive(message)}`, ...maskedMeta);
  },

  warn(message: string, ...meta: unknown[]): void {
    const maskedMeta = meta.map(maskSensitive);
    console.warn(`[PayShield AI:WARN] ${maskSensitive(message)}`, ...maskedMeta);
  },

  error(message: string, ...meta: unknown[]): void {
    const maskedMeta = meta.map(maskSensitive);
    console.error(`[PayShield AI:ERROR] ${maskSensitive(message)}`, ...maskedMeta);
  },

  debug(message: string, ...meta: unknown[]): void {
    if (process.env.NODE_ENV !== "production") {
      const maskedMeta = meta.map(maskSensitive);
      console.debug(`[PayShield AI:DEBUG] ${maskSensitive(message)}`, ...maskedMeta);
    }
  },
};
