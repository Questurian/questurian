export interface SuccessResponse<T = any> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: any;
}

export type ApiResponse<T = any> = SuccessResponse<T> | ErrorResponse;

export function successResponse<T>(data: T): SuccessResponse<T> {
  return { success: true, data };
}

export function errorResponse(
  error: string,
  code?: string,
  details?: any
): ErrorResponse {
  return { success: false, error, code, details };
}
