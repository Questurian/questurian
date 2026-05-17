export interface TranslationApiHealthResponse {
  success: true;
  data: {
    healthy: boolean;
    error?: string;
  };
}
