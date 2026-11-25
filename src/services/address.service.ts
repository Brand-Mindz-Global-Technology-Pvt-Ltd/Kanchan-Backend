import crypto from 'node:crypto';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { pool } from '../config/db.ts';
import type {
  CustomerAddress,
  CreateAddressInput,
  UpdateAddressInput,
  AddressTag,
} from '../types/address.types.ts';

interface AddressRow extends RowDataPacket {
  id: string;
  customer_id: string;
  name: string;
  phone: string;
  pincode: string;
  flat_building: string;
  street_colony: string;
  landmark: string | null;
  tag: AddressTag;
  is_default: number | boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapRowToAddress(row: AddressRow): CustomerAddress {
  return {
    id: row.id,
    customerId: row.customer_id,
    name: row.name,
    phone: row.phone,
    pincode: row.pincode,
    flatBuilding: row.flat_building,
    streetColony: row.street_colony,
    landmark: row.landmark ?? undefined,
    tag: row.tag,
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

// In-memory cache synced with MySQL to support synchronous downstream modules (e.g. order placement)
const addressesById: Map<string, CustomerAddress> = new Map();
let isLoaded = false;

/**
 * Loads all customer addresses from MySQL into the in-memory cache.
 * Note: Does not create demo addresses or dummy customer data.
 */
export async function ensureAddressesLoaded(): Promise<void> {
  if (isLoaded) return;
  try {
    const [rows] = await pool.query<AddressRow[]>('SELECT * FROM customer_addresses');
    addressesById.clear();
    for (const r of rows) {
      const addr = mapRowToAddress(r);
      addressesById.set(addr.id, addr);
    }
    isLoaded = true;
  } catch (error) {
    console.warn('[AddressService] Could not sync addresses from MySQL:', error instanceof Error ? error.message : error);
  }
}

export function validateAndNormalizePhone(phone: unknown): string {
  if (typeof phone !== 'string' || !phone.trim()) {
    throw new Error("Validation failed: 'phone' is required and must be a 10-digit mobile number");
  }
  const clean = phone.trim().replace(/^(\+91|91)/, '').replace(/[\s-]/g, '');
  if (!/^\d{10}$/.test(clean)) {
    throw new Error("Validation failed: 'phone' must be a valid 10-digit mobile number");
  }
  return clean;
}

export function validateAndNormalizePincode(pincode: unknown): string {
  if (typeof pincode !== 'string' && typeof pincode !== 'number') {
    throw new Error("Validation failed: 'pincode' is required and must be a 6-digit postal code");
  }
  const clean = String(pincode).trim();
  if (!/^\d{6}$/.test(clean)) {
    throw new Error("Validation failed: 'pincode' must be exactly 6 digits");
  }
  return clean;
}

export function validateTag(tag: unknown): AddressTag {
  if (typeof tag !== 'string' || !tag.trim()) {
    throw new Error("Validation failed: 'tag' is required and must be 'HOME' or 'WORK'");
  }
  const upper = tag.trim().toUpperCase();
  if (upper !== 'HOME' && upper !== 'WORK') {
    throw new Error("Validation failed: 'tag' must be either 'HOME' or 'WORK'");
  }
  return upper as AddressTag;
}

export function getAddressesByCustomer(customerId: string): Promise<CustomerAddress[]> & CustomerAddress[] {
  const cached = Array.from(addressesById.values())
    .filter((a) => a.customerId === customerId)
    .sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.createdAt.localeCompare(b.createdAt);
    });

  const promise = (async () => {
    await ensureAddressesLoaded();
    const [rows] = await pool.query<AddressRow[]>(
      `SELECT id, customer_id, name, phone, pincode, flat_building, street_colony, landmark, tag, is_default, created_at, updated_at
       FROM customer_addresses
       WHERE customer_id = ?
       ORDER BY is_default DESC, created_at ASC, id ASC`,
      [customerId]
    );

    const list = rows.map(mapRowToAddress);
    for (const addr of list) {
      addressesById.set(addr.id, addr);
    }
    return list;
  })();

  return Object.assign(promise, cached) as any;
}

export function getAddressById(
  customerId: string,
  addressId: string
): (Promise<CustomerAddress | undefined> & CustomerAddress) | undefined {
  const trimmed = addressId.trim();
  const cached = addressesById.get(trimmed);
  const validCached = cached && cached.customerId === customerId ? cached : undefined;

  const promise = (async () => {
    await ensureAddressesLoaded();
    const [rows] = await pool.query<AddressRow[]>(
      `SELECT id, customer_id, name, phone, pincode, flat_building, street_colony, landmark, tag, is_default, created_at, updated_at
       FROM customer_addresses
       WHERE customer_id = ? AND id = ?
       LIMIT 1`,
      [customerId, trimmed]
    );

    const row = rows[0];
    if (!row) {
      if (cached && cached.customerId === customerId) {
        addressesById.delete(trimmed);
      }
      return undefined;
    }

    const addr = mapRowToAddress(row);
    addressesById.set(addr.id, addr);
    return addr;
  })();

  if (validCached) {
    return Object.assign(promise, validCached) as any;
  }
  return promise as any;
}

export function createAddress(
  customerId: string,
  input: CreateAddressInput
): Promise<CustomerAddress> & CustomerAddress {
  const newId = `addr-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();

  const tempAddress: CustomerAddress = {
    id: newId,
    customerId,
    name: input.name.trim(),
    phone: input.phone,
    pincode: input.pincode,
    flatBuilding: input.flatBuilding.trim(),
    streetColony: input.streetColony.trim(),
    landmark: input.landmark?.trim() || undefined,
    tag: input.tag,
    isDefault: input.isDefault ?? false,
    createdAt: now,
    updatedAt: now,
  };

  const promise = (async () => {
    await ensureAddressesLoaded();

    const [countRows] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM customer_addresses WHERE customer_id = ?',
      [customerId]
    );
    const existingCount = Number(countRows[0]?.['count']) || 0;

    let isDefault = false;
    if (existingCount === 0) {
      isDefault = true;
    } else if (input.isDefault === true) {
      isDefault = true;
      await pool.query<ResultSetHeader>(
        'UPDATE customer_addresses SET is_default = 0, updated_at = ? WHERE customer_id = ? AND is_default = 1',
        [new Date(), customerId]
      );
      for (const a of addressesById.values()) {
        if (a.customerId === customerId && a.isDefault) {
          a.isDefault = false;
          a.updatedAt = new Date().toISOString();
        }
      }
    }

    const nowDate = new Date();
    await pool.query<ResultSetHeader>(
      `INSERT INTO customer_addresses (
        id, customer_id, name, phone, pincode, flat_building, street_colony, landmark, tag, is_default, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId,
        customerId,
        input.name.trim(),
        input.phone,
        input.pincode,
        input.flatBuilding.trim(),
        input.streetColony.trim(),
        input.landmark?.trim() || null,
        input.tag,
        isDefault ? 1 : 0,
        nowDate,
        nowDate,
      ]
    );

    const createdAddr: CustomerAddress = {
      ...tempAddress,
      isDefault,
      createdAt: nowDate.toISOString(),
      updatedAt: nowDate.toISOString(),
    };

    addressesById.set(newId, createdAddr);
    return createdAddr;
  })();

  return Object.assign(promise, tempAddress) as any;
}

export function updateAddress(
  customerId: string,
  addressId: string,
  input: UpdateAddressInput
): Promise<CustomerAddress> & CustomerAddress {
  const trimmedId = addressId.trim();
  const cached = addressesById.get(trimmedId);

  let tempUpdated: CustomerAddress | null = null;
  if (cached && cached.customerId === customerId) {
    tempUpdated = {
      ...cached,
      name: input.name !== undefined ? input.name.trim() : cached.name,
      phone: input.phone !== undefined ? input.phone : cached.phone,
      pincode: input.pincode !== undefined ? input.pincode : cached.pincode,
      flatBuilding: input.flatBuilding !== undefined ? input.flatBuilding.trim() : cached.flatBuilding,
      streetColony: input.streetColony !== undefined ? input.streetColony.trim() : cached.streetColony,
      landmark: input.landmark !== undefined ? input.landmark.trim() || undefined : cached.landmark,
      tag: input.tag !== undefined ? input.tag : cached.tag,
      isDefault: input.isDefault !== undefined ? input.isDefault : cached.isDefault,
      updatedAt: new Date().toISOString(),
    };
  }

  const promise = (async () => {
    await ensureAddressesLoaded();

    const [rows] = await pool.query<AddressRow[]>(
      'SELECT * FROM customer_addresses WHERE customer_id = ? AND id = ? LIMIT 1',
      [customerId, trimmedId]
    );
    const existingRow = rows[0];
    if (!existingRow) {
      throw new Error(`ADDRESS_NOT_FOUND: Address with ID '${addressId}' not found`);
    }

    const currentAddr = mapRowToAddress(existingRow);
    let isDefault = currentAddr.isDefault;

    if (input.isDefault === true) {
      await pool.query<ResultSetHeader>(
        'UPDATE customer_addresses SET is_default = 0, updated_at = ? WHERE customer_id = ? AND id != ?',
        [new Date(), customerId, trimmedId]
      );
      for (const a of addressesById.values()) {
        if (a.customerId === customerId && a.id !== trimmedId && a.isDefault) {
          a.isDefault = false;
          a.updatedAt = new Date().toISOString();
        }
      }
      isDefault = true;
    } else if (input.isDefault === false && currentAddr.isDefault) {
      const [otherRows] = await pool.query<AddressRow[]>(
        'SELECT id FROM customer_addresses WHERE customer_id = ? AND id != ? ORDER BY created_at ASC LIMIT 1',
        [customerId, trimmedId]
      );
      const otherRow = otherRows[0];
      if (otherRow) {
        await pool.query<ResultSetHeader>(
          'UPDATE customer_addresses SET is_default = 1, updated_at = ? WHERE customer_id = ? AND id = ?',
          [new Date(), customerId, otherRow.id]
        );
        const otherCached = addressesById.get(otherRow.id);
        if (otherCached) {
          otherCached.isDefault = true;
          otherCached.updatedAt = new Date().toISOString();
        }
        isDefault = false;
      }
    }

    const updatedName = input.name !== undefined ? input.name.trim() : currentAddr.name;
    const updatedPhone = input.phone !== undefined ? input.phone : currentAddr.phone;
    const updatedPincode = input.pincode !== undefined ? input.pincode : currentAddr.pincode;
    const updatedFlatBuilding = input.flatBuilding !== undefined ? input.flatBuilding.trim() : currentAddr.flatBuilding;
    const updatedStreetColony = input.streetColony !== undefined ? input.streetColony.trim() : currentAddr.streetColony;
    const updatedLandmark = input.landmark !== undefined ? input.landmark.trim() || null : (currentAddr.landmark ?? null);
    const updatedTag = input.tag !== undefined ? input.tag : currentAddr.tag;
    const updateTime = new Date();

    await pool.query<ResultSetHeader>(
      `UPDATE customer_addresses SET
        name = ?, phone = ?, pincode = ?, flat_building = ?, street_colony = ?, landmark = ?, tag = ?, is_default = ?, updated_at = ?
      WHERE customer_id = ? AND id = ?`,
      [
        updatedName,
        updatedPhone,
        updatedPincode,
        updatedFlatBuilding,
        updatedStreetColony,
        updatedLandmark,
        updatedTag,
        isDefault ? 1 : 0,
        updateTime,
        customerId,
        trimmedId,
      ]
    );

    const resultAddr: CustomerAddress = {
      id: trimmedId,
      customerId,
      name: updatedName,
      phone: updatedPhone,
      pincode: updatedPincode,
      flatBuilding: updatedFlatBuilding,
      streetColony: updatedStreetColony,
      landmark: updatedLandmark ?? undefined,
      tag: updatedTag,
      isDefault,
      createdAt: currentAddr.createdAt,
      updatedAt: updateTime.toISOString(),
    };

    addressesById.set(trimmedId, resultAddr);
    return resultAddr;
  })();

  if (tempUpdated) {
    return Object.assign(promise, tempUpdated) as any;
  }
  return promise as any;
}

export function deleteAddress(
  customerId: string,
  addressId: string
): Promise<boolean> & boolean {
  const trimmedId = addressId.trim();
  const cached = addressesById.get(trimmedId);
  const existed = cached && cached.customerId === customerId;
  if (existed) {
    addressesById.delete(trimmedId);
  }

  const promise = (async () => {
    await ensureAddressesLoaded();

    const [rows] = await pool.query<AddressRow[]>(
      'SELECT id, is_default FROM customer_addresses WHERE customer_id = ? AND id = ? LIMIT 1',
      [customerId, trimmedId]
    );
    const target = rows[0];
    if (!target) {
      throw new Error(`ADDRESS_NOT_FOUND: Address with ID '${addressId}' not found`);
    }

    const wasDefault = Boolean(target.is_default);

    await pool.query<ResultSetHeader>(
      'DELETE FROM customer_addresses WHERE customer_id = ? AND id = ?',
      [customerId, trimmedId]
    );
    addressesById.delete(trimmedId);

    if (wasDefault) {
      const [remaining] = await pool.query<AddressRow[]>(
        'SELECT id FROM customer_addresses WHERE customer_id = ? ORDER BY created_at ASC LIMIT 1',
        [customerId]
      );
      const newDefRow = remaining[0];
      if (newDefRow) {
        await pool.query<ResultSetHeader>(
          'UPDATE customer_addresses SET is_default = 1, updated_at = ? WHERE customer_id = ? AND id = ?',
          [new Date(), customerId, newDefRow.id]
        );
        const remCached = addressesById.get(newDefRow.id);
        if (remCached) {
          remCached.isDefault = true;
          remCached.updatedAt = new Date().toISOString();
        }
      }
    }

    return true;
  })();

  return Object.assign(promise, existed ?? false) as any;
}

export function setDefaultAddress(
  customerId: string,
  addressId: string
): Promise<CustomerAddress> & CustomerAddress {
  const trimmedId = addressId.trim();
  const cached = addressesById.get(trimmedId);

  const promise = (async () => {
    await ensureAddressesLoaded();

    const [rows] = await pool.query<AddressRow[]>(
      'SELECT * FROM customer_addresses WHERE customer_id = ? AND id = ? LIMIT 1',
      [customerId, trimmedId]
    );
    const target = rows[0];
    if (!target) {
      throw new Error(`ADDRESS_NOT_FOUND: Address with ID '${addressId}' not found`);
    }

    const now = new Date();

    await pool.query<ResultSetHeader>(
      'UPDATE customer_addresses SET is_default = 0, updated_at = ? WHERE customer_id = ? AND is_default = 1',
      [now, customerId]
    );

    await pool.query<ResultSetHeader>(
      'UPDATE customer_addresses SET is_default = 1, updated_at = ? WHERE customer_id = ? AND id = ?',
      [now, customerId, trimmedId]
    );

    for (const a of addressesById.values()) {
      if (a.customerId === customerId) {
        if (a.id === trimmedId) {
          a.isDefault = true;
          a.updatedAt = now.toISOString();
        } else if (a.isDefault) {
          a.isDefault = false;
          a.updatedAt = now.toISOString();
        }
      }
    }

    const updated = mapRowToAddress({ ...target, is_default: 1, updated_at: now });
    addressesById.set(trimmedId, updated);
    return updated;
  })();

  if (cached && cached.customerId === customerId) {
    return Object.assign(promise, { ...cached, isDefault: true }) as any;
  }
  return promise as any;
}
