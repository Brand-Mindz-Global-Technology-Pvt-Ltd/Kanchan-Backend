import type { CustomerAddress } from './address.types.ts';
import type { Order } from './order.types.ts';

export interface SafeCustomer {
  id: string;
  fullName: string;
  email: string;
  mobileNumber?: string | undefined;
  gender?: string | undefined;
  address?: string | undefined;
  createdAt: string;
}

export interface AdminCustomer extends SafeCustomer {
  totalOrders: number;
  totalSpent: number;
}

export interface AdminCustomerDetails extends SafeCustomer {
  totalOrders: number;
  totalSpent: number;
  addresses: CustomerAddress[];
  orders: Order[];
}

export interface CustomerRecord extends SafeCustomer {
  passwordHash: string; // "salt:hash" - never exposed in responses
}

export interface AuthSession {
  token: string;
  customerId: string;
  createdAt: string;
  expiresAt: string;
}

export type RegisterCustomerInput = {
  fullName: string;
  email: string;
  password: string;
  confirmPassword?: string | undefined;
  mobileNumber?: string | undefined;
  gender?: string | undefined;
  address?: string | undefined;
};

export type LoginCustomerInput = {
  email: string;
  password: string;
};

export type UpdateCustomerProfileInput = {
  fullName?: string | undefined;
  email?: string | undefined;
  mobileNumber?: string | undefined;
  gender?: string | undefined;
  address?: string | undefined;
};

export interface AuthResponseData {
  token: string;
  customer: SafeCustomer;
}
