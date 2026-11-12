import "server-only";
import { z } from "zod";

const paypalEnvSchema = z.object({
  PAYPAL_CLIENT_ID: z.string({ required_error: "PAYPAL_CLIENT_ID is required." }).min(1, "PAYPAL_CLIENT_ID is required."),
  PAYPAL_CLIENT_SECRET: z.string({ required_error: "PAYPAL_CLIENT_SECRET is required." }).min(1, "PAYPAL_CLIENT_SECRET is required."),
  PAYPAL_ENVIRONMENT: z
    .string({ required_error: "PAYPAL_ENVIRONMENT is required." })
    .min(1, "PAYPAL_ENVIRONMENT is required.")
    .refine((value) => value === "sandbox", 'PAYPAL_ENVIRONMENT must be "sandbox". Live mode is not supported.'),
  PAYPAL_WEBHOOK_ID: z.string().optional(),
});

const openAIEnvSchema = z.object({
  OPENAI_API_KEY: z.string({ required_error: "OPENAI_API_KEY is required when OpenAI analysis is enabled." }).min(1, "OPENAI_API_KEY is required when OpenAI analysis is enabled."),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
});

export class ConfigurationError extends Error {
  constructor(details: string[]) {
    super(
      `[PayShield AI] Configuration Error: ${details.join(" ")} ` +
      "Update .env.local and restart the development server."
    );
    this.name = "ConfigurationError";
  }
}

function parseConfig<T>(result: ReturnType<typeof paypalEnvSchema.safeParse> | ReturnType<typeof openAIEnvSchema.safeParse>): T {
  if (!result.success) {
    throw new ConfigurationError(result.error.errors.map((issue) => issue.message));
  }

  return result.data as T;
}

/**
 * Returns PayPal configuration safely.
 */
export function getPayPalConfig() {
  const config = parseConfig<z.infer<typeof paypalEnvSchema>>(
    paypalEnvSchema.safeParse({
      PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
      PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
      PAYPAL_ENVIRONMENT: process.env.PAYPAL_ENVIRONMENT,
      PAYPAL_WEBHOOK_ID: process.env.PAYPAL_WEBHOOK_ID || undefined,
    })
  );

  return {
    clientId: config.PAYPAL_CLIENT_ID,
    clientSecret: config.PAYPAL_CLIENT_SECRET,
    environment: config.PAYPAL_ENVIRONMENT,
    webhookId: config.PAYPAL_WEBHOOK_ID,
  };
}

/**
 * Returns OpenAI configuration safely.
 */
export function getOpenAIConfig() {
  const env = parseConfig<z.infer<typeof openAIEnvSchema>>(
    openAIEnvSchema.safeParse({
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-4o-mini",
    })
  );

  return {
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
  };
}

/**
 * Check if OpenAI API key is present without throwing, enabling graceful fallback in AI pipeline.
 */
export function hasOpenAIKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0);
}

/** Validate optional PayPal credentials when present and report whether verification is available. */
export function isPayPalConfigured(): boolean {
  const hasClientId = Boolean(process.env.PAYPAL_CLIENT_ID?.trim());
  const hasClientSecret = Boolean(process.env.PAYPAL_CLIENT_SECRET?.trim());
  if (!hasClientId && !hasClientSecret) return false;
  if (!hasClientId || !hasClientSecret) {
    throw new ConfigurationError(["PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must both be configured."]);
  }
  getPayPalConfig();
  return true;
}