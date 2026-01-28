import type { Context } from "hono";
import { join } from "path";

export async function serveImage(c: Context) {
  const pathname = c.req.path;
  const relativePath = pathname.replace("/api/images/", "");
  const imagesPath = process.env.IMAGES_PATH || join(process.cwd(), "data/images");
  const filePath = join(imagesPath, relativePath);
  const file = Bun.file(filePath);
  const exists = await file.exists();

  if (exists) {
    return new Response(file);
  }

  return c.text("Image Not Found", 404);
}
