import type { Context, Next } from "hono";
import type { ZodTypeAny } from "zod";
import { ValidationError } from "../errors/http-error";

export function validateBody<TSchema extends ZodTypeAny>(schema: TSchema) {
  return async (c: Context, next: Next) => {
    let body: unknown = null;
    try {
      body = await c.req.json();
      const validated = schema.parse(body);
      c.set("validatedBody", validated);
      await next();
    } catch (error: any) {
      if (error.errors) {
        console.error("❌ Validation failed with errors:", JSON.stringify(error.errors, null, 2));
        console.error("📦 Request body was:", JSON.stringify(body, null, 2));
        throw new ValidationError("Validation failed", error.errors);
      }
      throw error;
    }
  };
}

export function validateQuery<TSchema extends ZodTypeAny>(schema: TSchema) {
  return async (c: Context, next: Next) => {
    try {
      const query = c.req.query();
      const validated = schema.parse(query);
      c.set("validatedQuery", validated);
      await next();
    } catch (error: any) {
      if (error.errors) {
        throw new ValidationError("Query validation failed", error.errors);
      }
      throw error;
    }
  };
}

export function validateParams<TSchema extends ZodTypeAny>(schema: TSchema) {
  return async (c: Context, next: Next) => {
    try {
      const params = c.req.param();
      const validated = schema.parse(params);
      c.set("validatedParams", validated);
      await next();
    } catch (error: any) {
      if (error.errors) {
        throw new ValidationError("Params validation failed", error.errors);
      }
      throw error;
    }
  };
}
