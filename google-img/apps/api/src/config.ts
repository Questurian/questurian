import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

const currentDir = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(currentDir, "..");
const workspaceRoot = resolve(apiRoot, "../..");

function loadEnvFileIfPresent(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }

  process.loadEnvFile(filePath);
}

// Load workspace-level .env first, then app-level .env overrides.
loadEnvFileIfPresent(resolve(workspaceRoot, ".env"));
loadEnvFileIfPresent(resolve(apiRoot, ".env"));

const envSchema = z.object({
  GOOGLE_CLOUD_PROJECT: z.string().min(1, "GOOGLE_CLOUD_PROJECT is required."),
  GOOGLE_CLOUD_LOCATION: z.string().min(1, "GOOGLE_CLOUD_LOCATION is required."),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  FRONTEND_ORIGIN: z.string().default("http://localhost:5173,http://localhost:5183"),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(50).default(10),
  VERTEX_IMAGE_MODEL: z.string().min(1).default("imagen-4.0-ultra-generate-001"),
  VERTEX_IMAGE_EDIT_MODEL: z.string().min(1).default("gemini-3-pro-image-preview"),
  VERTEX_SAMPLE_IMAGE_SIZE: z.preprocess(
    (value) => (typeof value === "string" ? value.toUpperCase() : value),
    z.enum(["1K", "2K"]).default("2K")
  )
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join(" ");
  throw new Error(`Invalid backend environment configuration. ${issues}`);
}

export const appConfig = {
  project: parsed.data.GOOGLE_CLOUD_PROJECT,
  location: parsed.data.GOOGLE_CLOUD_LOCATION,
  port: parsed.data.PORT,
  frontendOrigin: parsed.data.FRONTEND_ORIGIN,
  maxUploadMb: parsed.data.MAX_UPLOAD_MB,
  maxUploadBytes: parsed.data.MAX_UPLOAD_MB * 1024 * 1024,
  textToImageModel: parsed.data.VERTEX_IMAGE_MODEL,
  imageEditModel: parsed.data.VERTEX_IMAGE_EDIT_MODEL,
  sampleImageSize: parsed.data.VERTEX_SAMPLE_IMAGE_SIZE
};
