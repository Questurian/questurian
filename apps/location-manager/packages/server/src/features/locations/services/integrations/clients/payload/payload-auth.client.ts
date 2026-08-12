import { EnvConfig } from "@server/shared/config/env.config";
import { ServiceUnavailableError } from "@server/shared/core/errors/http-error";

export class PayloadAuthClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(config: EnvConfig) {
    this.apiUrl = config.PAYLOAD_API_URL;
    this.apiKey = config.PAYLOAD_API_KEY;
  }

  isConfigured(): boolean {
    return !!(this.apiUrl && this.apiKey);
  }

  getApiUrl(): string {
    return this.apiUrl;
  }

  async authHeader(): Promise<{ Authorization: string }> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableError("Payload CMS");
    }

    return { Authorization: `service-accounts API-Key ${this.apiKey}` };
  }

  async testConnection(): Promise<void> {
    const response = await fetch(`${this.apiUrl}/api/access`, {
      method: "GET",
      headers: await this.authHeader(),
    });

    if (!response.ok) {
      throw new Error(`Payload access check failed (${response.status})`);
    }

    const permissions = (await response.json()) as {
      collections?: { locations?: { create?: true } };
    };
    if (permissions.collections?.locations?.create !== true) {
      throw new Error(
        "Payload credential lacks required locations:create access",
      );
    }
  }
}
