import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";

import { appConfig } from "./config.js";
import { HttpError } from "./errors.js";
import { transformImage } from "./vertex.js";

const app = express();

const configuredOrigins = appConfig.frontendOrigin
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOrigin =
  configuredOrigins.includes("*") || configuredOrigins.length === 0
    ? true
    : configuredOrigins.length === 1
      ? configuredOrigins[0]
      : configuredOrigins;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: appConfig.maxUploadBytes
  }
});

app.use(
  cors({
    origin: corsOrigin
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    textToImageModel: appConfig.textToImageModel,
    imageToImageModel: appConfig.imageEditModel,
    maxUploadMb: appConfig.maxUploadMb,
    sampleImageSize: appConfig.sampleImageSize
  });
});

app.post("/api/transform", upload.single("image"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = req.file;
    if (file) {
      if (!file.mimetype.startsWith("image/")) {
        throw new HttpError(400, "Invalid file type. Please upload a valid image file.");
      }

      if (file.size > appConfig.maxUploadBytes) {
        throw new HttpError(
          413,
          `Image exceeds the ${appConfig.maxUploadMb}MB limit. Please upload a smaller image.`
        );
      }
    }

    const rawPrompt = typeof req.body.prompt === "string" ? req.body.prompt : "";
    const prompt = rawPrompt.trim();

    if (!prompt) {
      throw new HttpError(400, "Prompt is required. Add guidance for how the image should be transformed.");
    }

    const transformed = await transformImage({
      prompt,
      imageBase64: file?.buffer.toString("base64"),
      imageMimeType: file?.mimetype
    });

    return res.status(200).json({
      message: "Image generated successfully.",
      warning: transformed.warning,
      output: {
        mimeType: transformed.mimeType,
        imageDataUrl: `data:${transformed.mimeType};base64,${transformed.imageBase64}`,
        mode: transformed.mode,
        model: transformed.usedModel,
        aspectRatio: "16:9",
        sampleImageSize: transformed.mode === "text-to-image" ? appConfig.sampleImageSize : undefined
      }
    });
  } catch (error) {
    return next(error);
  }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: `Image exceeds the ${appConfig.maxUploadMb}MB limit. Please upload a smaller image.`
    });
  }

  if (error instanceof HttpError) {
    return res.status(error.statusCode).json({
      error: error.message
    });
  }

  console.error("Unhandled error", error);
  return res.status(500).json({
    error: "Unexpected server error. Please try again."
  });
});

app.listen(appConfig.port, () => {
  console.log(`API server listening on http://localhost:${appConfig.port}`);
});
