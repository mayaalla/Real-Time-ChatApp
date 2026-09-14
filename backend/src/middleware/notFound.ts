import type { Request, Response } from "express";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    ok: false,
    code: "NOT_FOUND",
    message: `${req.method} ${req.originalUrl} does not exist`,
  });
}