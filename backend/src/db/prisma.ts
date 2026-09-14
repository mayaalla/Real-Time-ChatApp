import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "../config/env.js";
import { PrismaClient } from "../generated/prisma/client.js";

// ---------------------------------------------------------------------------
// One PrismaClient for the whole app. Import `prisma` from this file.
// Never write `new PrismaClient()` anywhere else.
// ---------------------------------------------------------------------------

const SLOW_QUERY_MS = 200;

const createPrismaClient = () => {
  const adapter = new PrismaPg({
    // Pooled Neon string. Migrations use DIRECT_URL; the app never does.
    connectionString: env.DATABASE_URL,

    // How many connections this one process may open.
    max: 10,

    // Without this, a stuck request waits forever instead of failing.
    connectionTimeoutMillis: 10_000,

    // Neon sleeps when idle; don't hold sockets too long.
    idleTimeoutMillis: 30_000,
  });

  // Keep this list written out here, exactly like this. If you move it into a
  // variable or an if/else, TypeScript stops knowing what `event` is below.
  const client = new PrismaClient({
    adapter,
    log: [
      { emit: "event", level: "query" },
      { emit: "stdout", level: "warn" },
      { emit: "stdout", level: "error" },
    ],
  });

  // Print only slow queries. Inside the function, so it is added only once.
  client.$on("query", (event) => {
    if (event.duration < SLOW_QUERY_MS) return;

    if (env.NODE_ENV === "production") {
      console.warn(`[prisma] slow query ${event.duration}ms`);
    } else {
      console.warn(`[prisma] slow query ${event.duration}ms: ${event.query}`);
    }
  });

  return client;
};

/** The type of our client. Use `Db` instead of writing `PrismaClient`. */
export type Db = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as { prisma?: Db };

export const prisma: Db = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// ---------------------------------------------------------------------------
// Small helpers for the health check (Part 6.3) and startup (Part 6.4).
// ---------------------------------------------------------------------------

export const pingDb = async (): Promise<boolean> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
};

export const connectDb = async (): Promise<void> => {
  await prisma.$connect();
};

export const disconnectDb = async (): Promise<void> => {
  await prisma.$disconnect();
};