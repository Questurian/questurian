import { API_BASE_URL } from "./config";
import { unwrapEntry } from "./client";
import type { UploadResponse } from "./types";

export function uploadWithProgress(
  endpoint: string,
  formData: FormData,
  onProgress?: (percent: number) => void
): Promise<UploadResponse["entry"]> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(percent);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText) as UploadResponse;
          resolve(unwrapEntry(response));
        } catch {
          reject(new Error("Failed to parse response"));
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.statusText}`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Upload failed")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

    xhr.open("POST", `${API_BASE_URL}${endpoint}`);
    xhr.send(formData);
  });
}
