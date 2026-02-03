import { type ChangeEvent, type DragEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";

type ToastType = "success" | "error" | "info";

type Toast = {
  id: number;
  type: ToastType;
  message: string;
};

type OutputMode = "text-to-image" | "image-to-image";

type TransformResponse = {
  message: string;
  warning?: string;
  output: {
    imageDataUrl: string;
    mimeType: string;
    mode: OutputMode;
    model: string;
    aspectRatio: string;
    sampleImageSize?: string;
  };
};

type GenerationMeta = {
  model: string;
  mode: OutputMode;
  sampleImageSize?: string;
};

const DEFAULT_MAX_UPLOAD_MB = 10;
const envMaxUploadMb = Number(import.meta.env.VITE_MAX_UPLOAD_MB);
const maxUploadMb = Number.isFinite(envMaxUploadMb) && envMaxUploadMb > 0 ? envMaxUploadMb : DEFAULT_MAX_UPLOAD_MB;
const maxUploadBytes = maxUploadMb * 1024 * 1024;

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");

function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [generationMeta, setGenerationMeta] = useState<GenerationMeta | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (uploadedPreviewUrl) {
        URL.revokeObjectURL(uploadedPreviewUrl);
      }
    };
  }, [uploadedPreviewUrl]);

  const canSubmit = useMemo(() => {
    return prompt.trim().length > 0 && !isSubmitting;
  }, [prompt, isSubmitting]);

  const pushToast = (type: ToastType, message: string): void => {
    const id = Date.now() + Math.floor(Math.random() * 1000);

    setToasts((prev) => [...prev, { id, type, message }]);

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3800);
  };

  const clearSelectedFile = (): void => {
    setSelectedFile(null);
    setUploadedPreviewUrl((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return null;
    });

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const updateSelectedFile = (file: File | null): void => {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      clearSelectedFile();
      pushToast("error", "That file is not an image. Please upload a valid photo.");
      return;
    }

    if (file.size > maxUploadBytes) {
      clearSelectedFile();
      pushToast("error", `Upload failed: ${file.name} exceeds the ${maxUploadMb}MB size limit.`);
      return;
    }

    setSelectedFile(file);
    setUploadedPreviewUrl((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return URL.createObjectURL(file);
    });
    pushToast("success", `Upload confirmed: ${file.name} (${formatSize(file.size)}).`);
    pushToast("info", "Photo detected. Using Nano Banana Pro for image-to-image.");
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>): void => {
    updateSelectedFile(event.target.files?.[0] ?? null);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0] ?? null;
    updateSelectedFile(file);
  };

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      pushToast("error", "Please add a prompt so Vertex AI knows what to generate.");
      return;
    }

    const payload = new FormData();
    payload.append("prompt", trimmedPrompt);
    if (selectedFile) {
      payload.append("image", selectedFile);
    }

    setIsSubmitting(true);
    setResultImage(null);
    setGenerationMeta(null);
    pushToast(
      "info",
      selectedFile
        ? "Prompt submitted. Generating with Nano Banana Pro..."
        : "Prompt submitted. Generating with Imagen 4 Ultra (2K)..."
    );

    try {
      const response = await fetch(`${apiBaseUrl}/api/transform`, {
        method: "POST",
        body: payload
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as { error?: string };
        const errorMessage = errorBody.error ?? "Request failed. Please try again.";
        throw new Error(errorMessage);
      }

      const body = (await response.json()) as TransformResponse;
      setResultImage(body.output.imageDataUrl);
      setGenerationMeta({
        model: body.output.model,
        mode: body.output.mode,
        sampleImageSize: body.output.sampleImageSize
      });

      if (body.warning) {
        pushToast("info", body.warning);
      }

      pushToast("success", "Generation complete. Your output is ready.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected request failure.";
      pushToast("error", message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="app-shell">
      <section className="app-card">
        <header className="card-header">
          <p className="eyebrow">Vertex AI Image Studio</p>
          <h1>Prompt-first. Photo optional.</h1>
          <p className="intro">
            Add a prompt to generate a <strong>16:9 landscape</strong> image. Uploading a photo triggers
            <strong> Nano Banana Pro</strong> for image-to-image edits. No photo uses <strong>Imagen 4 Ultra</strong>
            text-to-image with 2K output.
          </p>
        </header>

        <form className="panel-grid" onSubmit={handleSubmit}>
          <div
            className={`dropzone ${isDragging ? "dropzone--active" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <input
              ref={inputRef}
              className="visually-hidden"
              type="file"
              accept="image/*"
              onChange={handleInputChange}
            />

            <p className="dropzone-title">Drag and drop a photo (optional)</p>
            <p className="dropzone-subtitle">or</p>
            <button type="button" className="secondary-button" onClick={() => inputRef.current?.click()}>
              Browse files
            </button>
            <p className="helper-text">Max size: {maxUploadMb}MB</p>

            {selectedFile ? (
              <>
                <div className="file-pill">
                  <span>{selectedFile.name}</span>
                  <span>{formatSize(selectedFile.size)}</span>
                </div>
                <button type="button" className="clear-button" onClick={clearSelectedFile}>
                  Use prompt only
                </button>
              </>
            ) : null}
          </div>

          <label className="field" htmlFor="prompt">
            Prompt
            <textarea
              id="prompt"
              name="prompt"
              value={prompt}
              placeholder="Example: Create a premium travel thumbnail with dramatic side lighting and layered fog over mountains."
              onChange={(event) => setPrompt(event.target.value)}
            />
          </label>

          <button className="primary-button" type="submit" disabled={!canSubmit}>
            {isSubmitting ? "Generating..." : "Generate image"}
          </button>
        </form>

        <section className="result-panel" aria-live="polite">
          <div className="preview-grid">
            <article className="preview-card">
              <div className="result-meta">
                <h2>Uploaded source</h2>
                <span>{selectedFile ? "Nano Banana Pro input" : "No source image"}</span>
              </div>
              <div className="result-frame">
                {uploadedPreviewUrl ? (
                  <img src={uploadedPreviewUrl} alt="Uploaded source preview" />
                ) : (
                  <p>Upload an image to preview it here.</p>
                )}
              </div>
            </article>

            <article className="preview-card">
              <div className="result-meta">
                <h2>Generated result</h2>
                <span>
                  {generationMeta
                    ? `${generationMeta.model}${
                        generationMeta.sampleImageSize ? ` (${generationMeta.sampleImageSize})` : ""
                      }`
                    : "16:9 output preview"}
                </span>
              </div>
              <div className="result-frame">
                {resultImage ? (
                  <img src={resultImage} alt="Generated result" />
                ) : (
                  <p>Your generated image appears here.</p>
                )}
              </div>
            </article>
          </div>
        </section>
      </section>

      <aside className="toast-stack" aria-live="assertive" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.type}`}>
            {toast.message}
          </div>
        ))}
      </aside>
    </main>
  );
}
