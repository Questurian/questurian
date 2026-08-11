import { EnvConfig } from "@server/shared/config/env.config";
import { ServiceUnavailableError } from "@server/shared/core/errors/http-error";
import type { PayloadAuthResponse, PayloadCustomAuthResponse } from "./payload-auth.types";

export class PayloadAuthClient {
  private readonly apiUrl: string;
  private readonly serviceEmail: string;
  private readonly servicePassword: string;
  private authToken: string | null = null;
  private tokenExpiry: number | null = null;

  constructor(config: EnvConfig) {
    this.apiUrl = config.PAYLOAD_API_URL;
    this.serviceEmail = config.PAYLOAD_SERVICE_EMAIL;
    this.servicePassword = config.PAYLOAD_SERVICE_PASSWORD;
  }

  isConfigured(): boolean {
    return !!(this.apiUrl && this.serviceEmail && this.servicePassword);
  }

  getApiUrl(): string {
    return this.apiUrl;
  }

  async authHeader(): Promise<{ Authorization: string }> {
    const token = await this.ensureAuthenticated();
    return { Authorization: `JWT ${token}` };
  }

  async authenticate(): Promise<string> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableError("Payload CMS");
    }

    const primaryUrl = `${this.apiUrl}/api/users/login`;
    const payload = {
      email: this.serviceEmail,
      password: this.servicePassword,
    };

    const response = await fetch(primaryUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const data = (await response.json()) as PayloadAuthResponse;
      this.authToken = data.token;
      this.tokenExpiry = data.exp * 1000;
      console.log(
        `✓ Authenticated with Payload via /api/users/login. Token expires: ${new Date(this.tokenExpiry)}`
      );
      return data.token;
    }

    const primaryError = await response.text();
    console.warn(
      `[Payload] /api/users/login failed (${response.status}). Trying /api/auth/login fallback...`
    );

    const fallbackUrl = `${this.apiUrl}/api/auth/login`;
    const fallbackResponse = await fetch(fallbackUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!fallbackResponse.ok) {
      const fallbackError = await fallbackResponse.text();
      throw new Error(
        `Payload authentication failed on both endpoints. ` +
          `[users/login ${response.status}] ${primaryError} | ` +
          `[auth/login ${fallbackResponse.status}] ${fallbackError}`
      );
    }

    const fallbackData = (await fallbackResponse.json()) as PayloadCustomAuthResponse;
    if (!fallbackData?.token) {
      throw new Error("Payload auth fallback succeeded but no token was returned");
    }

    this.authToken = fallbackData.token;
    this.tokenExpiry = Date.now() + 55 * 60 * 1000;
    console.log("✓ Authenticated with Payload via /api/auth/login fallback.");

    return fallbackData.token;
  }

  async ensureAuthenticated(): Promise<string> {
    const now = Date.now();

    if (!this.authToken || !this.tokenExpiry || now >= this.tokenExpiry - 300000) {
      console.log("🔄 Payload token expired or missing, re-authenticating...");
      await this.authenticate();
    }

    return this.authToken!;
  }
}
