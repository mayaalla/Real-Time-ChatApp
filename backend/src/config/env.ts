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