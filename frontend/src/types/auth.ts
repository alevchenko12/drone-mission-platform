export type UserRole = "admin" | "operator" | "viewer";

export interface CurrentUser {
  id: string;
  email: string;
  organization_id: string;
  role: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}