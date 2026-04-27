import { API_BASE_URL } from "./config";
import { type ApiResponse, unwrapEntry } from "./client";
import type { UploadResponse } from "./types";

export function uploadFormDataWithProgress<T>(
  endpoint: string,
  formData: FormData,
  onProgress?: (percent: number) => void
): Promise<T> {
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
          const response = JSON.parse(xhr.responseText) as ApiResponse<T>;
          if (response.success && response.data !== undefined) {
            resolve(response.data);
            return;
          }
          resolve(response as T);
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

export async function uploadWithProgress(
  endpoint: string,
  formData: FormData,
  onProgress?: (percent: number) => void
): Promise<UploadResponse["entry"]> {
  const response = await uploadFormDataWithProgress<UploadResponse>(endpoint, formData, onProgress);
  return unwrapEntry(response);
}
