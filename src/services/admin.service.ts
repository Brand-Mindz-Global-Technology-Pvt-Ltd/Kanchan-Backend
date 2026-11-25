import crypto from 'node:crypto';
import type {
  SafeAdmin,
  AdminRecord,
  AdminSession,
  AdminLoginInput,
  AdminAuthResponseData,
} from '../types/admin.types.ts';

/**
 * =========================================================================
 * TEMPORARY IN-MEMORY ADMIN & SESSION STORAGE:
 * Admin records and active sessions are stored in-memory for development
 * and testing without a live database.
 * Admin sessions reset when the server restarts.
 * =========================================================================
 */
const adminsByEmail: Map<string, AdminRecord> = new Map();
const adminsById: Map<string, AdminRecord> = new Map();
const activeAdminSessions: Map<string, AdminSession> = new Map();

// Secure password hashing using Node.js native crypto scrypt with unique salt
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

// Timing-safe password verification
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split(':');
    const salt = parts[0];
    const key = parts[1];
    if (!salt || !key) {
      return false;
    }
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    if (keyBuffer.length !== derivedKey.length) {
      return false;
    }
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}

// Generate cryptographically secure random authentication token for admin
export function generateAdminToken(): string {
  return `adm_${crypto.randomBytes(32).toString('hex')}`;
}

// Strip sensitive data before returning safe admin profile
export function toSafeAdmin(record: AdminRecord): SafeAdmin {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    role: 'admin',
    createdAt: record.createdAt,
  };
}

// Seed initial admin from environment variables (or secure fallback defaults in dev)
const seedInitialAdmin = (): void => {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@kanchan.com').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@Kanchan2026';
  const adminName = process.env.ADMIN_NAME || 'Kanchan Administrator';

  const adminRecord: AdminRecord = {
    id: 'admin-1',
    name: adminName,
    email: adminEmail,
    role: 'admin',
    passwordHash: hashPassword(adminPassword),
    createdAt: new Date().toISOString(),
  };

  adminsByEmail.set(adminEmail, adminRecord);
  adminsById.set(adminRecord.id, adminRecord);
};

seedInitialAdmin();

export const findAdminById = (id: string): SafeAdmin | undefined => {
  const record = adminsById.get(id.trim());
  return record ? toSafeAdmin(record) : undefined;
};

export const findAdminByEmail = (email: string): AdminRecord | undefined => {
  return adminsByEmail.get(email.trim().toLowerCase());
};

export const loginAdmin = (input: AdminLoginInput): AdminAuthResponseData => {
  const normalizedEmail = input.email.trim().toLowerCase();
  const record = adminsByEmail.get(normalizedEmail);

  if (!record || !verifyPassword(input.password, record.passwordHash)) {
    throw new Error('INVALID_CREDENTIALS: Invalid admin email or password');
  }

  const token = generateAdminToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const session: AdminSession = {
    token,
    adminId: record.id,
    createdAt: now.toISOString(),
    expiresAt,
  };

  activeAdminSessions.set(token, session);

  return {
    token,
    admin: toSafeAdmin(record),
  };
};

export const verifyAdminSessionToken = (token: string): SafeAdmin | undefined => {
  const trimmed = token.trim();
  const session = activeAdminSessions.get(trimmed);
  if (!session) {
    return undefined;
  }

  if (new Date(session.expiresAt) < new Date()) {
    activeAdminSessions.delete(trimmed);
    return undefined;
  }

  return findAdminById(session.adminId);
};

export const logoutAdmin = (token: string): boolean => {
  const trimmed = token.trim();
  const session = activeAdminSessions.get(trimmed);
  if (!session) {
    return false;
  }
  activeAdminSessions.delete(trimmed);
  return true;
};

