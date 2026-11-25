export interface SafeAdmin {
  id: string;
  name: string;
  email: string;
  role: 'admin';
  createdAt: string;
}

export interface AdminRecord extends SafeAdmin {
  passwordHash: string; // "salt:hash" - never exposed in responses
}

export interface AdminSession {
  token: string;
  adminId: string;
  createdAt: string;
  expiresAt: string;
}

export interface AdminLoginInput {
  email: string;
  password: string;
}

export interface AdminAuthResponseData {
  token: string;
  admin: SafeAdmin;
}

