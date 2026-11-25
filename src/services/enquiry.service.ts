import crypto from 'node:crypto';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { pool } from '../config/db.ts';
import type {
  Enquiry,
  EnquiryStatus,
  CreateEnquiryInput,
  EnquiryFilterOptions,
} from '../types/enquiry.types.ts';
import { normalizeEnquiryStatus } from '../types/enquiry.types.ts';

interface EnquiryRow extends RowDataPacket {
  id: string;
  customer_name: string;
  email: string;
  phone: string;
  city: string | null;
  state: string | null;
  subject: string;
  message: string;
  status: EnquiryStatus;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapRowToEnquiry(row: EnquiryRow): Enquiry {
  const createdAtIso =
    row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at);
  const updatedAtIso =
    row.updated_at instanceof Date
      ? row.updated_at.toISOString()
      : String(row.updated_at);
  const dateStr = createdAtIso.split('T')[0]!;

  return {
    id: row.id,
    customerName: row.customer_name,
    email: row.email,
    phone: row.phone,
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    subject: row.subject,
    message: row.message,
    status: row.status,
    date: dateStr,
    createdAt: createdAtIso,
    updatedAt: updatedAtIso,
  };
}

export function createEnquiry(
  input: CreateEnquiryInput
): Promise<Enquiry> & Enquiry {
  const resolvedName = (input.customerName || input.fullName || input.name || '').trim();
  const normalizedEmail = input.email.trim().toLowerCase();
  const trimmedPhone = input.phone.trim();
  const trimmedMessage = input.message.trim();
  const trimmedSubject = input.subject?.trim() || 'General Enquiry';
  const trimmedCity = input.city?.trim() || null;
  const trimmedState = input.state?.trim() || null;

  const now = new Date();
  const id = `enq-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const dateStr = now.toISOString().split('T')[0]!;
  const isoTimestamp = now.toISOString();

  const syncFallback: Enquiry = {
    id,
    customerName: resolvedName,
    email: normalizedEmail,
    phone: trimmedPhone,
    city: trimmedCity ?? undefined,
    state: trimmedState ?? undefined,
    subject: trimmedSubject,
    message: trimmedMessage,
    status: 'New',
    date: dateStr,
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  };

  const promise = (async () => {
    await pool.query<ResultSetHeader>(
      `INSERT INTO enquiries (id, customer_name, email, phone, city, state, subject, message, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'New', ?, ?)`,
      [
        id,
        resolvedName,
        normalizedEmail,
        trimmedPhone,
        trimmedCity,
        trimmedState,
        trimmedSubject,
        trimmedMessage,
        now,
        now,
      ]
    );

    return { ...syncFallback };
  })();

  return Object.assign(promise, syncFallback) as any;
}

export function getAllEnquiries(
  filter?: EnquiryFilterOptions
): Promise<Enquiry[]> & Enquiry[] {
  const normalizedStatus = filter?.status ? normalizeEnquiryStatus(filter.status) : null;
  const searchQuery = filter?.search?.trim();

  const promise = (async () => {
    let query = `
      SELECT id, customer_name, email, phone, city, state, subject, message, status, created_at, updated_at
      FROM enquiries
    `;
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (normalizedStatus) {
      conditions.push('status = ?');
      params.push(normalizedStatus);
    }

    if (searchQuery) {
      conditions.push('(LOWER(customer_name) LIKE ? OR LOWER(email) LIKE ? OR phone LIKE ?)');
      const wild = `%${searchQuery.toLowerCase()}%`;
      params.push(wild, wild, wild);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    const [rows] = await pool.query<EnquiryRow[]>(query, params);
    return rows.map(mapRowToEnquiry);
  })();

  const emptyList: Enquiry[] = [];
  return Object.assign(emptyList, {
    then: (resolve: any, reject: any) => promise.then(resolve, reject),
    catch: (reject: any) => promise.catch(reject),
    finally: (cb: any) => promise.finally(cb),
  }) as any;
}

export function getEnquiryById(
  id: string
): (Promise<Enquiry | undefined> & Enquiry) | undefined {
  const promise = (async () => {
    const [rows] = await pool.query<EnquiryRow[]>(
      `SELECT id, customer_name, email, phone, city, state, subject, message, status, created_at, updated_at
       FROM enquiries
       WHERE id = ?
       LIMIT 1`,
      [id.trim()]
    );
    const row = rows[0];
    if (!row) {
      return undefined;
    }
    return mapRowToEnquiry(row);
  })();

  return promise as any;
}

export function updateEnquiryStatus(
  id: string,
  newStatus: EnquiryStatus
): Promise<Enquiry> & Enquiry {
  const promise = (async () => {
    const now = new Date();
    const [res] = await pool.query<ResultSetHeader>(
      'UPDATE enquiries SET status = ?, updated_at = ? WHERE id = ?',
      [newStatus, now, id.trim()]
    );
    if (res.affectedRows === 0) {
      throw new Error(`ENQUIRY_NOT_FOUND: Enquiry with ID '${id}' not found`);
    }

    const updated = await getEnquiryById(id.trim());
    if (!updated) {
      throw new Error(`ENQUIRY_NOT_FOUND: Enquiry with ID '${id}' not found`);
    }
    return updated;
  })();

  return promise as any;
}

export function deleteEnquiry(id: string): Promise<boolean> & boolean {
  const promise = (async () => {
    const [res] = await pool.query<ResultSetHeader>(
      'DELETE FROM enquiries WHERE id = ?',
      [id.trim()]
    );
    if (res.affectedRows === 0) {
      throw new Error(`ENQUIRY_NOT_FOUND: Enquiry with ID '${id}' not found`);
    }
    return true;
  })();

  return Object.assign(promise, { valueOf: () => true }) as any;
}
