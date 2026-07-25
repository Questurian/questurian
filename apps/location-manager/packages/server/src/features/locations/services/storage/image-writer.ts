import { join } from "node:path";
import { sanitizeUploadedImageBuffer } from "../../utils/image-upload-sanitizer";
import { extractImageMetadata } from "../../utils/image-metadata-extractor";
import type { ImagePathResolver } from "./image-path-resolver";
import type { SaveImageResult, SavedImageSource } from "./image-storage.types";

/**
 * Read image file and return as Buffer
 */
export async function readImage(paths: ImagePathResolver, filePath: string): Promise<Buffer> {
  // Handle both relative and absolute paths
  const absolutePath = paths.toAbsolutePath(filePath);

  const file = Bun.file(absolutePath);

  if (!await file.exists()) {
    throw new Error(`Image file not found: ${filePath}`);
  }

  const arrayBuffer = await file.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Save images from URLs to filesystem
 */
export async function saveImagesFromUrls(
  paths: ImagePathResolver,
  imageUrls: string[],
  storagePath: string,
  fileExtension: string = "jpg"
): Promise<SaveImageResult> {
  await paths.ensureDirectoryExists(storagePath);

  const savedPaths: string[] = [];
  const errors: Array<{ index: number; error: string }> = [];

  const fetchWithRetry = async (url: string): Promise<Response> => {
    // First attempt: plain fetch
    let res = await fetch(url);
    if (res.ok) return res;

    // Retry once with browser-like headers (helps with some Instagram CDN URLs)
    res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Referer": "https://www.instagram.com/",
      },
    });
    return res;
  };

  for (let i = 0; i < imageUrls.length; i++) {
    const imgUrl = imageUrls[i];
    try {
      const imgRes = await fetchWithRetry(imgUrl!);
      if (!imgRes.ok) {
        throw new Error(`HTTP ${imgRes.status}`);
      }

      const filename = `image_${i}.${fileExtension}`;
      const filePath = join(storagePath, filename);
      await Bun.write(filePath, await imgRes.blob());

      savedPaths.push(paths.toStoredPath(filePath));
    } catch (err) {
      errors.push({
        index: i,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  return { savedPaths, errors };
}

export async function saveSanitizedImageFromUrl(
  paths: ImagePathResolver,
  url: string,
  storagePath: string
): Promise<SavedImageSource> {
  await paths.ensureDirectoryExists(storagePath);
  let response = await fetch(url);
  if (!response.ok) {
    response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: "https://www.instagram.com/",
      },
    });
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const raw = Buffer.from(await response.arrayBuffer());
  const sanitized = await sanitizeUploadedImageBuffer(raw);
  const absolutePath = join(storagePath, "source_0.webp");
  await Bun.write(absolutePath, sanitized);
  return {
    path: paths.toStoredPath(absolutePath),
    metadata: await extractImageMetadata(absolutePath),
  };
}

/**
 * Stage a StagedSource from an image already on disk (relative `data/...`
 * or absolute path), re-encoding it into an independent `source_0.webp` under
 * `storagePath`. Mirrors {@link saveSanitizedImageFromUrl} without a network
 * fetch — used to backfill Instagram staging from previously-downloaded bytes.
 */
export async function saveSanitizedImageFromFile(
  paths: ImagePathResolver,
  localPath: string,
  storagePath: string
): Promise<SavedImageSource> {
  await paths.ensureDirectoryExists(storagePath);
  const raw = await readImage(paths, localPath);
  const sanitized = await sanitizeUploadedImageBuffer(raw);
  const absolutePath = join(storagePath, "source_0.webp");
  await Bun.write(absolutePath, sanitized);
  return {
    path: paths.toStoredPath(absolutePath),
    metadata: await extractImageMetadata(absolutePath),
  };
}

/**
 * Save uploaded File objects to filesystem, converting to WebP format
 */
export async function saveUploadedFiles(
  paths: ImagePathResolver,
  files: File[],
  storagePath: string
): Promise<SaveImageResult> {
  await paths.ensureDirectoryExists(storagePath);

  const savedPaths: string[] = [];
  const errors: Array<{ index: number; error: string }> = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) {
      errors.push({
        index: i,
        error: "File is undefined"
      });
      continue;
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const webpBuffer = await sanitizeUploadedImageBuffer(buffer);

      const filename = `image_${i}.webp`;
      const filePath = join(storagePath, filename);
      await Bun.write(filePath, webpBuffer);

      savedPaths.push(paths.toStoredPath(filePath));
    } catch (err) {
      errors.push({
        index: i,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  return { savedPaths, errors };
}
