import aiplatform from "@google-cloud/aiplatform";

import { appConfig } from "./config.js";
import { HttpError } from "./errors.js";

const { PredictionServiceClient } = aiplatform.v1;
const { PredictionServiceClient: PredictionServiceClientV1Beta1 } = aiplatform.v1beta1;
const { helpers } = aiplatform;

const imagePredictionClient = new PredictionServiceClient({
  apiEndpoint: `${appConfig.location}-aiplatform.googleapis.com`
});

const multimodalPredictionClient = new PredictionServiceClientV1Beta1({
  apiEndpoint: `${appConfig.location}-aiplatform.googleapis.com`
});

type TransformMode = "text-to-image" | "image-to-image";

type TransformRequest = {
  prompt: string;
  imageBase64?: string;
  imageMimeType?: string;
};

type TransformResponse = {
  imageBase64: string;
  mimeType: string;
  usedModel: string;
  mode: TransformMode;
  warning?: string;
};

type VertexValue = NonNullable<aiplatform.protos.google.protobuf.IValue>;
type GeminiPart = aiplatform.protos.google.cloud.aiplatform.v1beta1.IPart;

function buildImageEditPrompt(prompt: string): string {
  return `Use the uploaded image as the source. ${prompt} Return one high-quality 16:9 landscape image.`;
}

function getStringField(value: unknown, fieldName: string): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const directField = (value as Record<string, unknown>)[fieldName];
  if (typeof directField === "string") {
    return directField;
  }

  const structValue = (value as { structValue?: { fields?: Record<string, { stringValue?: string }> } }).structValue;
  return structValue?.fields?.[fieldName]?.stringValue;
}

function toBase64(data: Uint8Array | Buffer | string | null | undefined): string | undefined {
  if (!data) {
    return undefined;
  }

  if (typeof data === "string") {
    return data;
  }

  return Buffer.from(data).toString("base64");
}

function extractInlineImage(parts: readonly GeminiPart[] | null | undefined): { imageBase64: string; mimeType: string } | null {
  if (!parts) {
    return null;
  }

  for (const part of parts) {
    const mimeType = part.inlineData?.mimeType;
    const imageBase64 = toBase64(part.inlineData?.data ?? undefined);

    if (mimeType?.startsWith("image/") && imageBase64) {
      return { imageBase64, mimeType };
    }
  }

  return null;
}

function mapVertexError(error: unknown, activeModel: string): HttpError {
  const message = error instanceof Error ? error.message : "Unknown Vertex AI error.";
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? Number((error as { code?: number }).code)
      : undefined;

  if (code === 16 || /default credentials|application default credentials|adc|unauthenticated/i.test(message)) {
    return new HttpError(
      401,
      "Google authentication failed. Run `gcloud auth application-default login` and try again."
    );
  }

  if (code === 7 || /permission denied|forbidden/i.test(message)) {
    return new HttpError(403, "Vertex AI denied the request. Verify project, location, and model access.");
  }

  if (code === 8 || /quota|rate/i.test(message)) {
    return new HttpError(429, "Vertex AI quota limit reached. Please retry in a moment.");
  }

  if (/no uri or raw bytes are provided in media content/i.test(message)) {
    return new HttpError(400, "Uploaded image was not accepted by the model. Please try another image file.");
  }

  if (code === 3 || /invalid argument|invalid/i.test(message)) {
    return new HttpError(400, `Vertex AI rejected the request for ${activeModel}: ${message}`);
  }

  return new HttpError(502, `Vertex AI request failed for ${activeModel}: ${message}`);
}

async function generateFromText(prompt: string): Promise<TransformResponse> {
  const endpoint = `projects/${appConfig.project}/locations/${appConfig.location}/publishers/google/models/${appConfig.textToImageModel}`;

  const instance = helpers.toValue({
    prompt
  }) as VertexValue;

  const parameters = helpers.toValue({
    sampleCount: 1,
    sampleImageSize: appConfig.sampleImageSize,
    aspectRatio: "16:9",
    outputOptions: {
      mimeType: "image/png"
    }
  }) as VertexValue;

  try {
    const [response] = await imagePredictionClient.predict({
      endpoint,
      instances: [instance],
      parameters
    });

    const prediction = response.predictions?.[0];
    const imageBase64 = getStringField(prediction, "bytesBase64Encoded");
    const mimeType = getStringField(prediction, "mimeType") ?? "image/png";

    if (!imageBase64) {
      throw new HttpError(502, "Vertex AI returned no image output.");
    }

    return {
      imageBase64,
      mimeType,
      usedModel: appConfig.textToImageModel,
      mode: "text-to-image"
    };
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    throw mapVertexError(error, appConfig.textToImageModel);
  }
}

async function generateFromImage(request: TransformRequest): Promise<TransformResponse> {
  if (!request.imageBase64) {
    throw new HttpError(400, "Uploaded image is missing.");
  }

  const model = `projects/${appConfig.project}/locations/${appConfig.location}/publishers/google/models/${appConfig.imageEditModel}`;

  const responseModalities = [
    aiplatform.protos.google.cloud.aiplatform.v1beta1.GenerationConfig.Modality.TEXT,
    aiplatform.protos.google.cloud.aiplatform.v1beta1.GenerationConfig.Modality.IMAGE
  ];

  try {
    const [response] = await multimodalPredictionClient.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: request.imageMimeType ?? "image/png",
                data: request.imageBase64
              }
            },
            {
              text: buildImageEditPrompt(request.prompt)
            }
          ]
        }
      ],
      generationConfig: {
        responseModalities,
        mediaResolution: aiplatform.protos.google.cloud.aiplatform.v1beta1.GenerationConfig.MediaResolution.MEDIA_RESOLUTION_HIGH
      }
    });

    for (const candidate of response.candidates ?? []) {
      const extracted = extractInlineImage(candidate.content?.parts ?? undefined);
      if (!extracted) {
        continue;
      }

      return {
        imageBase64: extracted.imageBase64,
        mimeType: extracted.mimeType,
        usedModel: appConfig.imageEditModel,
        mode: "image-to-image"
      };
    }

    throw new HttpError(502, "Vertex AI returned no image output.");
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    throw mapVertexError(error, appConfig.imageEditModel);
  }
}

export async function transformImage(request: TransformRequest): Promise<TransformResponse> {
  if (request.imageBase64) {
    return generateFromImage(request);
  }

  return generateFromText(request.prompt);
}
