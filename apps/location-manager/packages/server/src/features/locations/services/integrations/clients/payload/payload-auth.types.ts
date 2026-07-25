export interface PayloadAuthResponse {
  message: string;
  user: {
    id: string;
    email: string;
    role: string;
  };
  token: string;
  exp: number;
}

export interface PayloadCustomAuthResponse {
  token: string;
  user?: {
    id?: string;
    email?: string;
    role?: string;
  };
}
