export type EnquiryStatus = 'New' | 'Read' | 'Replied';

export const ENQUIRY_STATUSES: readonly EnquiryStatus[] = [
  'New',
  'Read',
  'Replied',
] as const;

export interface Enquiry {
  id: string;
  customerName: string;
  email: string;
  phone: string;
  city?: string | undefined;
  state?: string | undefined;
  subject: string;
  message: string;
  status: EnquiryStatus;
  date: string; // YYYY-MM-DD format for frontend admin compatibility
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
}

export interface CreateEnquiryInput {
  customerName?: string | undefined;
  fullName?: string | undefined; // Frontend ContactFormSection compatibility
  name?: string | undefined;     // Generic alias
  email: string;
  phone: string;
  city?: string | undefined;
  state?: string | undefined;
  subject?: string | undefined;
  message: string;
}

export interface UpdateEnquiryStatusInput {
  status: EnquiryStatus;
}

export interface EnquiryFilterOptions {
  status?: string | undefined;
  search?: string | undefined;
}

export function normalizeEnquiryStatus(statusStr?: string): EnquiryStatus | null {
  if (!statusStr || typeof statusStr !== 'string') return null;
  const lower = statusStr.trim().toLowerCase();
  if (lower === 'new') return 'New';
  if (lower === 'read') return 'Read';
  if (lower === 'replied') return 'Replied';
  return null;
}

