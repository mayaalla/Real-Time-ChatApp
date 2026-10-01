
import { createClient } from "redis";
import { env } from "../config/env.js";



function makeClient(label:string){
    const client = createClient({
        url:env.REDIS_URL,
        socket: {
                // TLS is required by hosted Redis providers (Upstash, Redis Cloud, etc.)
      // If your REDIS_URL starts with "rediss://" this enables TLS automatically.
      // We still set it explicitly so the intent is clear.
       //  tls: env.REDIS_URL.startsWith("rediss://"),

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