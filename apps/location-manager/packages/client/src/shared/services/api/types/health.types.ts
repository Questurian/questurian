export interface LeadsApiHealthResponse {
  success: true;
  data: {
    healthy: boolean;
    error?: string;
  };
}
