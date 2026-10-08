
import { createClient } from "redis";
import { env } from "../config/env.js";




function makeClient(label:string){
    // Fail fast — an empty URL causes silent reconnect loops instead of a clear error.
    if (!env.REDIS_URL) {
      throw new Error("REDIS_URL is not set in your .env file. Add a valid Redis connection string.");
    }

    const client = createClient({
        url: env.REDIS_URL,
        socket: {
                // TLS is automatically enabled by the rediss:// URL scheme.
                // Do NOT set tls:boolean here — that conflicts with the redis type definitions.
                // If you need explicit TLS options, pass an object (e.g., { rejectUnauthorized: false }).
        connectTimeout: 10000,
        reconnectStrategy: (retries) =>{

          // Automatically reconnect with increasing delays if the connection drops.
          if(retries>10){
              console.error(`[Redis:${label}] Too many reconnect attempts. Giving up.`);
              return new Error("Redis reconnect limit reached");
          }
                  // Wait longer each time: 100ms, 200ms, 400ms, 800ms … up to 3 seconds.
                  return Math.min(retries * 100, 3_000);
        },
        },
    });

    // Log errors so a Redis outage is visible in the terminal, not mysterious.
  client.on("error", (err) => {
    console.error(`[Redis:${label}] Error:`, err.message);
  });

  client.on("connect", () => {
    console.log(`[Redis:${label}] Connected.`);
  });

  client.on("reconnecting", () => {
    console.warn(`[Redis:${label}] Reconnecting…`);
  });

  return client;
}


// Create the three clients (not connected yet — .connect() is called below).
export const redisClient     = makeClient("main");
export const redisPublisher  = makeClient("publisher");
export const redisSubscriber = makeClient("subscriber");

/**
 * Call this once at server startup. Connects all three clients to Redis.
 * Throws if any connection fails, so the server does not start broken.
 */
export async function connectRedis(): Promise<void> {
    await Promise.all([
      redisClient.connect(),
      redisPublisher.connect(),
      redisSubscriber.connect(),
    ]);
    console.log("[Redis] All three clients connected successfully.");
  }
