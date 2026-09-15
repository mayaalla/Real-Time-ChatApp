import type { Request, Response, NextFunction } from "express";
import type { z } from "zod";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Shape describing what parts of the request to validate.
 * Every property is optional — only supply the schemas you actually need.
 */
export interface RequestSchema<
  TBody extends z.ZodTypeAny = z.ZodTypeAny,
  TParams extends z.ZodTypeAny = z.ZodTypeAny,
  TQuery extends z.ZodTypeAny = z.ZodTypeAny,
> {
  body?: TBody;
  params?: TParams;
  query?: TQuery;
}

/**
 * A single validation failure reported to the client.
 */
interface FieldError {
  field: string; // dot-joined path, e.g. "params.id" or "body.email"
  message: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Run a Zod schema against `input` and return either the parsed (coerced,
 * stripped of extra keys, etc.) value or a list of FieldErrors prefixed with
 * `prefix` (e.g. "body", "params", "query").
 */
function parseSection<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown,
  prefix: string,
): { ok: true; data: z.output<T> } | { ok: false; errors: FieldError[] } {
  const result = schema.safeParse(input);

  if (result.success) {
    return { ok: true, data: result.data as z.output<T> };
  }

  const errors: FieldError[] = result.error.issues.map((issue) => ({
    // issue.path is an array of string | number segments
    field: [prefix, ...issue.path].join("."),
    message: issue.message,
  }));

  return { ok: false, errors };
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Express middleware factory.
 *
 * Usage:
 *   router.post("/register", validate({ body: RegisterSchema }), handler);
 *
 * On success  — req.body / req.params / req.query are replaced with the
 *               cleaned, typed output from Zod (defaults applied, extra keys
 *               stripped, coercions applied, etc.).
 *
 * On failure  — responds immediately with HTTP 400 and a JSON body:
 *   {
 *     ok: false,
 *     code: "VALIDATION_ERROR",
 *     message: "Validation failed",
 *     errors: [{ field: "body.email", message: "Invalid email" }, ...]
 *   }
 */
export function validate<
  TBody extends z.ZodTypeAny,
  TParams extends z.ZodTypeAny,
  TQuery extends z.ZodTypeAny,
>(schema: RequestSchema<TBody, TParams, TQuery>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const allErrors: FieldError[] = [];

    // ---- body --------------------------------------------------------------
    if (schema.body !== undefined) {
      const r = parseSection(schema.body, req.body, "body");
      if (r.ok) {
        req.body = r.data;
      } else {
        allErrors.push(...r.errors);
      }
    }

    // ---- params ------------------------------------------------------------
    if (schema.params !== undefined) {
      const r = parseSection(schema.params, req.params, "params");
      if (r.ok) {
        // req.params is typed as a Record<string, string> but we widen it
        // so feature code can access the typed output directly.
        (req as Request & { params: unknown }).params = r.data as Record<
          string,
          string
        >;
      } else {
        allErrors.push(...r.errors);
      }
    }

    // ---- query -------------------------------------------------------------
    if (schema.query !== undefined) {
      const r = parseSection(schema.query, req.query, "query");
      if (r.ok) {
        (req as Request & { query: unknown }).query = r.data as Record<
          string,
          string
        >;
      } else {
        allErrors.push(...r.errors);
      }
    }

    // ---- respond or continue -----------------------------------------------
    if (allErrors.length > 0) {
      _res.status(400).json({
        ok: false,
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        errors: allErrors,
      });
      return; // do NOT call next() — response is already sent
    }

    next();
  };
}
