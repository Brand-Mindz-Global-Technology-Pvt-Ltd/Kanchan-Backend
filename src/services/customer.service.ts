import crypto from 'node:crypto';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { pool } from '../config/db.ts';
import type {
  SafeCustomer,
  AdminCustomer,
  CustomerRecord,
  AuthSession,
  RegisterCustomerInput,
  LoginCustomerInput,
  UpdateCustomerProfileInput,
  AuthResponseData,
} from '../types/customer.types.ts';

interface CustomerRow extends RowDataPacket {
  id: string;
  full_name: string;
  email: string;
  password_hash: string;
  mobile_number: string | null;
  gender: string | null;
  address: string | null;
  created_at: Date | string;
  updated_at?: Date | string;
}

function mapRowToSafeCustomer(row: CustomerRow): SafeCustomer {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    mobileNumber: row.mobile_number ?? undefined,
    gender: row.gender ?? undefined,
    address: row.address ?? undefined,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

function mapRowToCustomerRecord(row: CustomerRow): CustomerRecord {
  return {
    ...mapRowToSafeCustomer(row),
    passwordHash: row.password_hash,
  };
}

interface AdminCustomerRow extends RowDataPacket {
  id: string;
  full_name: string;
  email: string;
  mobile_number: string | null;
  gender: string | null;
  address: string | null;
  created_at: Date | string;
  total_orders: number | string;
  total_spent: number | string;
}

function mapRowToAdminCustomer(row: AdminCustomerRow): AdminCustomer {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    mobileNumber: row.mobile_number ?? undefined,
    gender: row.gender ?? undefined,
    address: row.address ?? undefined,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    totalOrders: Number(row.total_orders) || 0,
    totalSpent: Number(Number(row.total_spent || 0).toFixed(2)),
  };
}

// In-memory cache synced with MySQL to support synchronous downstream middleware/controllers
const customersByEmail: Map<string, CustomerRecord> = new Map();
const customersById: Map<string, CustomerRecord> = new Map();
const activeSessions: Map<string, { session: AuthSession; customer: SafeCustomer }> = new Map();

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

// Generate cryptographically secure random authentication token
export function generateAuthToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Strip password hash from customer object before returning
export function toSafeCustomer(record: CustomerRecord): SafeCustomer {
  return {
    id: record.id,
    fullName: record.fullName,
    email: record.email,
    mobileNumber: record.mobileNumber,
    gender: record.gender,
    address: record.address,
    createdAt: record.createdAt,
  };
}

// Seed initial in-memory demo customer matching frontend ShopContext Aditi Sharma
const initialDemoRecord: CustomerRecord = {
  id: 'customer-1',
  fullName: 'Aditi Sharma',
  email: 'aditi@kanchan.com',
  mobileNumber: '+91 98451 23456',
  gender: 'female',
  address: '#402, Green Meadows Enclave, HSR Layout, Bangalore',
  passwordHash: hashPassword('Kanchan@123'),
  createdAt: new Date().toISOString(),
};
customersByEmail.set(initialDemoRecord.email.toLowerCase(), initialDemoRecord);
customersById.set(initialDemoRecord.id, initialDemoRecord);

let isSeeded = false;

/**
 * Ensures initial verified demo customer is seeded into MySQL when the customers table is empty.
 * Synchronizes active sessions and customer maps from the database.
 */
export async function ensureCustomersSeeded(): Promise<void> {
  if (isSeeded) return;

  try {
    const [countRows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM customers');
    const count = Number(countRows[0]?.['count']) || 0;

    if (count === 0) {
      await pool.query<ResultSetHeader>(
        `INSERT INTO customers (id, full_name, email, password_hash, mobile_number, gender, address, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id=id`,
        [
          initialDemoRecord.id,
          initialDemoRecord.fullName,
          initialDemoRecord.email,
          initialDemoRecord.passwordHash,
          initialDemoRecord.mobileNumber,
          initialDemoRecord.gender,
          initialDemoRecord.address,
          new Date(),
        ]
      );
    }

    // Refresh customers from MySQL
    const [allCustomers] = await pool.query<CustomerRow[]>('SELECT * FROM customers');
    customersById.clear();
    customersByEmail.clear();
    for (const r of allCustomers) {
      const rec = mapRowToCustomerRecord(r);
      customersById.set(rec.id, rec);
      customersByEmail.set(rec.email.toLowerCase(), rec);
    }

    // Refresh active sessions from MySQL (only unexpired)
    const [allSessions] = await pool.query<RowDataPacket[]>(
      `SELECT s.token, s.customer_id, s.created_at, s.expires_at,
              c.id as cust_id, c.full_name, c.email, c.password_hash, c.mobile_number, c.gender, c.address, c.created_at as cust_created_at
       FROM customer_sessions s
       JOIN customers c ON s.customer_id = c.id
       WHERE s.expires_at > NOW()`
    );

    activeSessions.clear();
    for (const s of allSessions) {
      const custRow: CustomerRow = {
        id: String(s['cust_id']),
        full_name: String(s['full_name']),
        email: String(s['email']),
        password_hash: String(s['password_hash']),
        mobile_number: s['mobile_number'] ? String(s['mobile_number']) : null,
        gender: s['gender'] ? String(s['gender']) : null,
        address: s['address'] ? String(s['address']) : null,
        created_at: s['cust_created_at'] instanceof Date ? s['cust_created_at'] : String(s['cust_created_at']),
      } as CustomerRow;

      const safeCust = mapRowToSafeCustomer(custRow);
      const sessionObj: AuthSession = {
        token: String(s['token']),
        customerId: String(s['customer_id']),
        createdAt: s['created_at'] instanceof Date ? s['created_at'].toISOString() : String(s['created_at']),
        expiresAt: s['expires_at'] instanceof Date ? s['expires_at'].toISOString() : String(s['expires_at']),
      };
      activeSessions.set(sessionObj.token, { session: sessionObj, customer: safeCust });
    }

    isSeeded = true;
  } catch (error) {
    console.warn('[CustomerService] Could not check/seed customers in MySQL:', error instanceof Error ? error.message : error);
  }
}

export function findCustomerByEmail(email: string): Promise<CustomerRecord | undefined> & (CustomerRecord | undefined) {
  const normalized = email.trim().toLowerCase();
  const cached = customersByEmail.get(normalized);

  const promise = (async () => {
    await ensureCustomersSeeded();
    const [rows] = await pool.query<CustomerRow[]>(
      'SELECT id, full_name, email, password_hash, mobile_number, gender, address, created_at FROM customers WHERE LOWER(email) = LOWER(?) LIMIT 1',
      [normalized]
    );
    const row = rows[0];
    if (!row) {
      customersByEmail.delete(normalized);
      return undefined;
    }
    const rec = mapRowToCustomerRecord(row);
    customersByEmail.set(normalized, rec);
    customersById.set(rec.id, rec);
    return rec;
  })();

  if (cached) {
    return Object.assign(promise, cached) as any;
  }
  return promise as any;
}

export function findCustomerById(id: string): Promise<SafeCustomer | undefined> & (SafeCustomer | undefined) {
  const trimmed = id.trim();
  const cached = customersById.get(trimmed);

  const promise = (async () => {
    await ensureCustomersSeeded();
    const [rows] = await pool.query<CustomerRow[]>(
      'SELECT id, full_name, email, password_hash, mobile_number, gender, address, created_at FROM customers WHERE id = ? LIMIT 1',
      [trimmed]
    );
    const row = rows[0];
    if (!row) {
      customersById.delete(trimmed);
      return undefined;
    }
    const rec = mapRowToCustomerRecord(row);
    customersById.set(trimmed, rec);
    customersByEmail.set(rec.email.toLowerCase(), rec);
    return toSafeCustomer(rec);
  })();

  if (cached) {
    return Object.assign(promise, toSafeCustomer(cached)) as any;
  }
  return promise as any;
}

export function registerCustomer(input: RegisterCustomerInput): Promise<SafeCustomer> & SafeCustomer {
  const normalizedEmail = input.email.trim().toLowerCase();
  const id = `cust-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const passwordHash = hashPassword(input.password);
  const createdAt = new Date().toISOString();

  const tempRecord: CustomerRecord = {
    id,
    fullName: input.fullName.trim(),
    email: normalizedEmail,
    mobileNumber: input.mobileNumber?.trim() || undefined,
    gender: input.gender?.trim() || undefined,
    address: input.address?.trim() || undefined,
    passwordHash,
    createdAt,
  };
  const safeTemp = toSafeCustomer(tempRecord);

  // Optimistically set in memory
  customersByEmail.set(normalizedEmail, tempRecord);
  customersById.set(id, tempRecord);

  const promise = (async () => {
    await ensureCustomersSeeded();

    const [existing] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM customers WHERE LOWER(email) = LOWER(?) LIMIT 1',
      [normalizedEmail]
    );

    if (existing.length > 0) {
      customersByEmail.delete(normalizedEmail);
      customersById.delete(id);
      throw new Error(`EMAIL_ALREADY_EXISTS: An account with email '${normalizedEmail}' already exists`);
    }

    await pool.query<ResultSetHeader>(
      `INSERT INTO customers (id, full_name, email, password_hash, mobile_number, gender, address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tempRecord.id,
        tempRecord.fullName,
        tempRecord.email,
        tempRecord.passwordHash,
        tempRecord.mobileNumber ?? null,
        tempRecord.gender ?? null,
        tempRecord.address ?? null,
        new Date(),
      ]
    );

    customersByEmail.set(normalizedEmail, tempRecord);
    customersById.set(id, tempRecord);

    return safeTemp;
  })();

  return Object.assign(promise, safeTemp) as any;
}

export function loginCustomer(input: LoginCustomerInput): Promise<AuthResponseData> & AuthResponseData {
  const normalizedEmail = input.email.trim().toLowerCase();
  const cachedRecord = customersByEmail.get(normalizedEmail);

  let syncAuthData: AuthResponseData | null = null;
  if (cachedRecord && verifyPassword(input.password, cachedRecord.passwordHash)) {
    const token = generateAuthToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const safeCust = toSafeCustomer(cachedRecord);
    const session: AuthSession = {
      token,
      customerId: cachedRecord.id,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    activeSessions.set(token, { session, customer: safeCust });
    syncAuthData = { token, customer: safeCust };
  }

  const promise = (async () => {
    await ensureCustomersSeeded();

    const [rows] = await pool.query<CustomerRow[]>(
      'SELECT id, full_name, email, password_hash, mobile_number, gender, address, created_at FROM customers WHERE LOWER(email) = LOWER(?) LIMIT 1',
      [normalizedEmail]
    );
    const record = rows[0];

    if (!record || !verifyPassword(input.password, record.password_hash)) {
      throw new Error('INVALID_CREDENTIALS: Invalid email or password');
    }

    const token = syncAuthData?.token || generateAuthToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const safeCustomer = mapRowToSafeCustomer(record);
    const session: AuthSession = {
      token,
      customerId: record.id,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    await pool.query<ResultSetHeader>(
      `INSERT INTO customer_sessions (token, customer_id, created_at, expires_at)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at)`,
      [token, record.id, now, expiresAt]
    );

    activeSessions.set(token, { session, customer: safeCustomer });
    customersById.set(record.id, mapRowToCustomerRecord(record));
    customersByEmail.set(normalizedEmail, mapRowToCustomerRecord(record));

    return {
      token,
      customer: safeCustomer,
    };
  })();

  if (syncAuthData) {
    return Object.assign(promise, syncAuthData) as any;
  }
  return promise as any;
}

export function verifySessionToken(token: string): (Promise<SafeCustomer | undefined> & SafeCustomer) | undefined {
  const trimmed = token.trim();
  const cached = activeSessions.get(trimmed);

  if (cached) {
    if (new Date(cached.session.expiresAt) < new Date()) {
      activeSessions.delete(trimmed);
      pool.query('DELETE FROM customer_sessions WHERE token = ?', [trimmed]).catch(() => {});
      return undefined;
    }
  }

  const promise = (async () => {
    await ensureCustomersSeeded();

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT s.token, s.customer_id, s.expires_at,
              c.id, c.full_name, c.email, c.password_hash, c.mobile_number, c.gender, c.address, c.created_at
       FROM customer_sessions s
       JOIN customers c ON s.customer_id = c.id
       WHERE s.token = ?
       LIMIT 1`,
      [trimmed]
    );

    const row = rows[0];
    if (!row) {
      activeSessions.delete(trimmed);
      return undefined;
    }

    const expiresAt = row['expires_at'] instanceof Date ? row['expires_at'] : new Date(row['expires_at']);
    if (expiresAt < new Date()) {
      await pool.query('DELETE FROM customer_sessions WHERE token = ?', [trimmed]);
      activeSessions.delete(trimmed);
      return undefined;
    }

    const safeCustomer = mapRowToSafeCustomer(row as CustomerRow);
    const sessionObj: AuthSession = {
      token: String(row['token']),
      customerId: String(row['customer_id']),
      createdAt: row['created_at'] instanceof Date ? row['created_at'].toISOString() : String(row['created_at']),
      expiresAt: expiresAt.toISOString(),
    };

    activeSessions.set(trimmed, { session: sessionObj, customer: safeCustomer });
    return safeCustomer;
  })();

  if (cached) {
    return Object.assign(promise, cached.customer) as any;
  }
  return promise as any;
}

export function logoutCustomer(token: string): Promise<boolean> & boolean {
  const trimmed = token.trim();
  const existed = activeSessions.delete(trimmed);

  const promise = (async () => {
    await ensureCustomersSeeded();
    const [result] = await pool.query<ResultSetHeader>(
      'DELETE FROM customer_sessions WHERE token = ?',
      [trimmed]
    );
    activeSessions.delete(trimmed);
    return (result.affectedRows ?? 0) > 0 || existed;
  })();

  return Object.assign(promise, existed) as any;
}

export function updateCustomerProfile(
  customerId: string,
  input: UpdateCustomerProfileInput
): Promise<SafeCustomer> & SafeCustomer {
  const cached = customersById.get(customerId.trim());

  let tempUpdated: SafeCustomer | null = null;
  if (cached) {
    tempUpdated = {
      ...toSafeCustomer(cached),
      fullName: input.fullName !== undefined ? input.fullName.trim() : cached.fullName,
      email: input.email !== undefined ? input.email.trim().toLowerCase() : cached.email,
      mobileNumber: input.mobileNumber !== undefined ? input.mobileNumber.trim() || undefined : cached.mobileNumber,
      gender: input.gender !== undefined ? input.gender.trim() || undefined : cached.gender,
      address: input.address !== undefined ? input.address.trim() || undefined : cached.address,
    };
  }

  const promise = (async () => {
    await ensureCustomersSeeded();

    const [rows] = await pool.query<CustomerRow[]>(
      'SELECT id, full_name, email, password_hash, mobile_number, gender, address, created_at FROM customers WHERE id = ? LIMIT 1',
      [customerId.trim()]
    );
    const existing = rows[0];
    if (!existing) {
      throw new Error(`CUSTOMER_NOT_FOUND: Customer with ID '${customerId}' does not exist`);
    }

    let updatedEmail = existing.email;
    if (input.email !== undefined) {
      const normalizedEmail = input.email.trim().toLowerCase();
      if (normalizedEmail !== existing.email.toLowerCase()) {
        const [duplicateRows] = await pool.query<RowDataPacket[]>(
          'SELECT id FROM customers WHERE LOWER(email) = LOWER(?) AND id != ? LIMIT 1',
          [normalizedEmail, customerId.trim()]
        );
        if (duplicateRows.length > 0) {
          throw new Error(`EMAIL_ALREADY_EXISTS: Email '${normalizedEmail}' is already registered to another account`);
        }
        updatedEmail = normalizedEmail;
      }
    }

    const updatedFullName = input.fullName !== undefined ? input.fullName.trim() : existing.full_name;
    const updatedMobile = input.mobileNumber !== undefined ? (input.mobileNumber.trim() || null) : existing.mobile_number;
    const updatedGender = input.gender !== undefined ? (input.gender.trim() || null) : existing.gender;
    const updatedAddress = input.address !== undefined ? (input.address.trim() || null) : existing.address;

    await pool.query<ResultSetHeader>(
      `UPDATE customers
       SET full_name = ?, email = ?, mobile_number = ?, gender = ?, address = ?
       WHERE id = ?`,
      [updatedFullName, updatedEmail, updatedMobile, updatedGender, updatedAddress, customerId.trim()]
    );

    const updatedRecord: CustomerRecord = {
      id: existing.id,
      fullName: updatedFullName,
      email: updatedEmail,
      mobileNumber: updatedMobile ?? undefined,
      gender: updatedGender ?? undefined,
      address: updatedAddress ?? undefined,
      passwordHash: existing.password_hash,
      createdAt: existing.created_at instanceof Date ? existing.created_at.toISOString() : String(existing.created_at),
    };

    customersById.set(existing.id, updatedRecord);
    customersByEmail.delete(existing.email.toLowerCase());
    customersByEmail.set(updatedEmail.toLowerCase(), updatedRecord);

    const safeResult = toSafeCustomer(updatedRecord);

    // Update active session instances for this customer
    for (const [t, sess] of activeSessions.entries()) {
      if (sess.customer.id === existing.id) {
        sess.customer = safeResult;
        activeSessions.set(t, sess);
      }
    }

    return safeResult;
  })();

  if (tempUpdated) {
    return Object.assign(promise, tempUpdated) as any;
  }
  return promise as any;
}

export function getAllCustomers(search?: string): Promise<AdminCustomer[]> & AdminCustomer[] {
  let cachedList: AdminCustomer[] = Array.from(customersById.values()).map((c) => ({
    ...toSafeCustomer(c),
    totalOrders: 0,
    totalSpent: 0,
  }));
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    cachedList = cachedList.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.mobileNumber && c.mobileNumber.toLowerCase().includes(q))
    );
  }

  const promise = (async () => {
    await ensureCustomersSeeded();

    let query = `
      SELECT 
        c.id, 
        c.full_name, 
        c.email, 
        c.mobile_number, 
        c.gender, 
        c.address, 
        c.created_at,
        COUNT(o.id) AS total_orders,
        COALESCE(SUM(o.total_amount), 0.00) AS total_spent
      FROM customers c
      LEFT JOIN orders o ON c.id = o.customer_id
    `;
    const params: string[] = [];

    if (search && search.trim()) {
      query += ' WHERE LOWER(c.full_name) LIKE ? OR LOWER(c.email) LIKE ? OR LOWER(c.mobile_number) LIKE ?';
      const term = `%${search.trim().toLowerCase()}%`;
      params.push(term, term, term);
    }

    query += `
      GROUP BY 
        c.id, 
        c.full_name, 
        c.email, 
        c.mobile_number, 
        c.gender, 
        c.address, 
        c.created_at
      ORDER BY c.created_at DESC
    `;

    const [rows] = await pool.query<AdminCustomerRow[]>(query, params);
    return rows.map(mapRowToAdminCustomer);
  })();

  return Object.assign(promise, cachedList) as any;
}
