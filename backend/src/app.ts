import express, { type Application, type Request, type Response, type NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import { prisma } from "./db/prisma.js";


interface HttpError extends Error {
  status?: number;
}

export function createApp(): Application {
  const app = express();
  app.use(cors({ origin: "http://localhost:5173", credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
    app.use(helmet());
  app.use(express.json());
 app.get("/api/health", async (_req, res) => {
    let db: string;
    try {
      await prisma.$queryRaw`select 1`;
      db = "up";
    } catch {
      db = "down";
    }

    const ok = db === "up";
    res.status(ok ? 200 : 503).json({
      ok,
      uptime: Math.round(process.uptime()),
      checks: { db, redis: "not_configured" },
    });
  });

  app.use((req, res) => {
    res.status(404).json({ ok: false, message: `${req.method} ${req.originalUrl} not found` });
  });

  app.use((err: HttpError, _req: Request, res: Response, _next: NextFunction) => {
    res.status(err?.status ?? 500).json({ ok: false, message: err?.message ?? "Server error" });
  });

  app.use(
    pinoHttp({
      redact: ["req.headers.authorization", "req.headers.cookie"],
      transport: process.env.NODE_ENV === "production" ? undefined : { target: "pino-pretty" },
    })
  );


  return app;
}
