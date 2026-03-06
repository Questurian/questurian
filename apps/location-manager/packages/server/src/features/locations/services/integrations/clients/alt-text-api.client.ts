/**
 * AI Generation API Client
 *
 * External API client for the Python AI generation service.
 * Used for image alt text and short editorial copy generation.
 */

export interface NeighborhoodDescriptionGenerationInput {
  location_name?: string | null;
  category?: string | null;
  location_type?: string | null;
  district?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  country?: string | null;
  address?: string | null;
}

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
      const errorDetail = (await response.text().catch(() => '')).trim();
      const errorMessage = errorDetail || response.statusText;
      throw new Error(`Alt text generation failed (${response.status}): ${errorMessage}`);
    }

    const result = await response.json() as { alt: string };
    return result.alt;
  }

  /**
   * Generate a short neighborhood description using AI
   * @param input - Location context used to anchor the generated copy
   * @returns Generated neighborhood description
   */
  async generateNeighborhoodDescription(
    input: NeighborhoodDescriptionGenerationInput
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/neighborhood-description`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const errorDetail = (await response.text().catch(() => "")).trim();
      const errorMessage = errorDetail || response.statusText;
      throw new Error(
        `Neighborhood description generation failed (${response.status}): ${errorMessage}`
      );
    }

    const result = await response.json() as { description: string };
    return result.description;
  }
}
