import "dotenv/config";
import { z } from "zod";

// Describe every setting the app needs, and what it must look like.
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  // Pooled Neon string (host contains "-pooler"). Used by the app.
  DATABASE_URL: z.string().min(1),

  // Direct Neon string (no "-pooler"). Used only by migrations.
  DIRECT_URL: z.string().min(1),

  REDIS_URL: z.string().optional(),        // optional until Part 15
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  // ── JWT ────────────────────────────────────────────────────────────────────
  // Two separate secrets: a leaked refresh secret cannot forge an access token.
  // Minimum 32 characters so HMAC-SHA-256 has a full-block key.
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),

  // Passed directly to jsonwebtoken's `expiresIn` option.
  // Examples: "15m", "1h", "7d"
  JWT_ACCESS_EXPIRES_IN: z.string().min(1).default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().min(1).default("7d"),

  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),   // optional until Part 11
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),
  CLOUDINARY_URL: z.string().min(1).optional(),
});

const parsed = schema.safeParse(process.env);

// If a setting is missing or wrong, stop now with a clear message.
if (!parsed.success) {
  console.error("Bad environment settings:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = Object.freeze(parsed.data);