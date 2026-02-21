import type { Context } from "hono";
import { dirname, isAbsolute, join, resolve } from "path";
import { fileURLToPath } from "url";

function resolveImagesPath(rawPath?: string): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const serverRoot = resolve(currentDir, "../../../../../");
  const repoRoot = resolve(serverRoot, "../../../..");
  const defaultImagesPath = join(serverRoot, "data/images");

  if (!rawPath) {
    return defaultImagesPath;
  }

  if (isAbsolute(rawPath)) {
    return rawPath;
  }

  const normalized = rawPath.replace(/^\.\//, "");
  if (normalized === "packages/server/data/images") {
    return defaultImagesPath;
  }
  if (normalized.startsWith("packages/") || normalized.startsWith("apps/")) {
    return resolve(repoRoot, normalized);
  }

  return resolve(serverRoot, normalized);
}

export async function serveImage(c: Context) {
  const pathname = c.req.path;
  const relativePath = pathname.replace("/api/images/", "");
  const imagesPath = resolveImagesPath(process.env.IMAGES_PATH);
  const filePath = join(imagesPath, relativePath);
  const file = Bun.file(filePath);
  const exists = await file.exists();

  if (exists) {
    return new Response(file);
  }

  return c.text("Image Not Found", 404);
}
