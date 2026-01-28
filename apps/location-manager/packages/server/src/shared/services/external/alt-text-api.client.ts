/**
 * Alt Text API Client
 *
 * External API client for Python AI alt text generation service.
 * Used to automatically generate descriptive alt text for uploaded images.
 */

export class AltTextApiClient {
  private baseUrl: string;

  constructor(baseUrl = 'http://localhost:8642') {
    this.baseUrl = baseUrl;
  }

  /**
   * Generate alt text for an image using AI
   * @param imageBuffer - The image file buffer
   * @param filename - The original filename of the image
   * @param format - Optional image format (jpeg, png, webp, etc.)
   * @returns Generated alt text description
   */
  async generateAltText(imageBuffer: Buffer, filename: string, format?: string): Promise<string> {
    // Determine content type from format or filename
    let contentType = 'image/jpeg'; // default fallback
    if (format) {
      contentType = `image/${format.toLowerCase()}`;
    } else if (filename) {
      const ext = filename.split('.').pop()?.toLowerCase();
      if (ext === 'png') contentType = 'image/png';
      else if (ext === 'webp') contentType = 'image/webp';
      else if (ext === 'gif') contentType = 'image/gif';
      else if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg';
    }

    const formData = new FormData();
    formData.append('image', new Blob([imageBuffer], { type: contentType }), filename);

    const response = await fetch(`${this.baseUrl}/alt`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Alt text generation failed: ${response.statusText}`);
    }

    const result = await response.json() as { alt: string };
    return result.alt;
  }
}
