import type { IncomingMessage, ServerResponse } from 'node:http';
import * as addressService from '../services/address.service.ts';
import * as customerService from '../services/customer.service.ts';
import type {
  CreateAddressInput,
  UpdateAddressInput,
} from '../types/address.types.ts';
import type { SafeCustomer } from '../types/customer.types.ts';
import { sendJson, parseJsonBody } from '../middleware/http.middleware.ts';

function extractBearerToken(req: IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7).trim();
}

async function authenticateRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<SafeCustomer | null> {
  const token = extractBearerToken(req);
  if (!token) {
    sendJson(res, 401, {
      success: false,
      message: 'Unauthorized',
      error: 'Unauthorized: Invalid, missing, or expired session token',
    });
    return null;
  }

  const customer = await customerService.verifySessionToken(token);
  if (!customer) {
    sendJson(res, 401, {
      success: false,
      message: 'Unauthorized',
      error: 'Unauthorized: Invalid, missing, or expired session token',
    });
    return null;
  }

  return customer;
}

export const getAddresses = async (
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> => {
  try {
    const customer = await authenticateRequest(req, res);
    if (!customer) return;

    const addresses = await addressService.getAddressesByCustomer(customer.id);
    sendJson(res, 200, {
      success: true,
      data: addresses,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendJson(res, 500, { success: false, error: message });
  }
};

export const createAddress = async (
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> => {
  try {
    const customer = await authenticateRequest(req, res);
    if (!customer) return;

    const body = await parseJsonBody<Record<string, unknown>>(req);
    if (!body || typeof body !== 'object') {
      sendJson(res, 400, {
        success: false,
        error: 'Invalid or empty JSON request body',
      });
      return;
    }

    // Validate name
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'name' is required and must be a non-empty string",
      });
      return;
    }

    // Validate flatBuilding
    if (
      !body.flatBuilding ||
      typeof body.flatBuilding !== 'string' ||
      !body.flatBuilding.trim()
    ) {
      sendJson(res, 400, {
        success: false,
        error:
          "Validation failed: 'flatBuilding' is required (Flat / House No. / Villa / Building)",
      });
      return;
    }

    // Validate streetColony
    if (
      !body.streetColony ||
      typeof body.streetColony !== 'string' ||
      !body.streetColony.trim()
    ) {
      sendJson(res, 400, {
        success: false,
        error:
          "Validation failed: 'streetColony' is required (Street, Road, Colony or Sector)",
      });
      return;
    }

    // Validate phone (10-digit mobile number)
    let validatedPhone: string;
    try {
      validatedPhone = addressService.validateAndNormalizePhone(body.phone);
    } catch (err) {
      sendJson(res, 400, {
        success: false,
        error: err instanceof Error ? err.message : 'Invalid phone number',
      });
      return;
    }

    // Validate pincode (6-digit postal code)
    let validatedPincode: string;
    try {
      validatedPincode = addressService.validateAndNormalizePincode(body.pincode);
    } catch (err) {
      sendJson(res, 400, {
        success: false,
        error: err instanceof Error ? err.message : 'Invalid pincode',
      });
      return;
    }

    // Validate tag ("HOME" or "WORK")
    let validatedTag;
    try {
      validatedTag = addressService.validateTag(body.tag);
    } catch (err) {
      sendJson(res, 400, {
        success: false,
        error: err instanceof Error ? err.message : 'Invalid tag',
      });
      return;
    }

    // Optional landmark
    let landmark: string | undefined = undefined;
    if (body.landmark !== undefined && body.landmark !== null) {
      if (typeof body.landmark !== 'string') {
        sendJson(res, 400, {
          success: false,
          error: "Validation failed: 'landmark' must be a string",
        });
        return;
      }
      landmark = body.landmark.trim() || undefined;
    }

    // Optional isDefault
    let isDefault: boolean | undefined = undefined;
    if (body.isDefault !== undefined && body.isDefault !== null) {
      if (typeof body.isDefault !== 'boolean') {
        sendJson(res, 400, {
          success: false,
          error: "Validation failed: 'isDefault' must be a boolean",
        });
        return;
      }
      isDefault = body.isDefault;
    }

    const input: CreateAddressInput = {
      name: body.name.trim(),
      phone: validatedPhone,
      pincode: validatedPincode,
      flatBuilding: body.flatBuilding.trim(),
      streetColony: body.streetColony.trim(),
      landmark,
      tag: validatedTag,
      isDefault,
    };

    const newAddress = await addressService.createAddress(customer.id, input);

    sendJson(res, 201, {
      success: true,
      message: 'Address created successfully',
      data: newAddress,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendJson(res, 400, { success: false, error: message });
  }
};

export const updateAddress = async (
  req: IncomingMessage,
  res: ServerResponse,
  addressId: string
): Promise<void> => {
  try {
    const customer = await authenticateRequest(req, res);
    if (!customer) return;

    if (!addressId || !addressId.trim()) {
      sendJson(res, 400, { success: false, error: 'Address ID is required' });
      return;
    }

    const body = await parseJsonBody<Record<string, unknown>>(req);
    if (!body || typeof body !== 'object') {
      sendJson(res, 400, {
        success: false,
        error: 'Invalid or empty JSON request body',
      });
      return;
    }

    const input: UpdateAddressInput = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        sendJson(res, 400, {
          success: false,
          error: "Validation failed: 'name' must be a non-empty string",
        });
        return;
      }
      input.name = body.name.trim();
    }

    if (body.flatBuilding !== undefined) {
      if (typeof body.flatBuilding !== 'string' || !body.flatBuilding.trim()) {
        sendJson(res, 400, {
          success: false,
          error: "Validation failed: 'flatBuilding' must be a non-empty string",
        });
        return;
      }
      input.flatBuilding = body.flatBuilding.trim();
    }

    if (body.streetColony !== undefined) {
      if (typeof body.streetColony !== 'string' || !body.streetColony.trim()) {
        sendJson(res, 400, {
          success: false,
          error: "Validation failed: 'streetColony' must be a non-empty string",
        });
        return;
      }
      input.streetColony = body.streetColony.trim();
    }

    if (body.phone !== undefined) {
      try {
        input.phone = addressService.validateAndNormalizePhone(body.phone);
      } catch (err) {
        sendJson(res, 400, {
          success: false,
          error: err instanceof Error ? err.message : 'Invalid phone number',
        });
        return;
      }
    }

    if (body.pincode !== undefined) {
      try {
        input.pincode = addressService.validateAndNormalizePincode(body.pincode);
      } catch (err) {
        sendJson(res, 400, {
          success: false,
          error: err instanceof Error ? err.message : 'Invalid pincode',
        });
        return;
      }
    }

    if (body.tag !== undefined) {
      try {
        input.tag = addressService.validateTag(body.tag);
      } catch (err) {
        sendJson(res, 400, {
          success: false,
          error: err instanceof Error ? err.message : 'Invalid tag',
        });
        return;
      }
    }

    if (body.landmark !== undefined) {
      if (body.landmark !== null && typeof body.landmark !== 'string') {
        sendJson(res, 400, {
          success: false,
          error: "Validation failed: 'landmark' must be a string",
        });
        return;
      }
      input.landmark =
        typeof body.landmark === 'string' ? body.landmark.trim() || undefined : undefined;
    }

    if (body.isDefault !== undefined) {
      if (typeof body.isDefault !== 'boolean') {
        sendJson(res, 400, {
          success: false,
          error: "Validation failed: 'isDefault' must be a boolean",
        });
        return;
      }
      input.isDefault = body.isDefault;
    }

    const updated = await addressService.updateAddress(customer.id, addressId, input);

    sendJson(res, 200, {
      success: true,
      message: 'Address updated successfully',
      data: updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.startsWith('ADDRESS_NOT_FOUND')) {
      sendJson(res, 404, { success: false, error: 'Address not found' });
      return;
    }
    sendJson(res, 400, { success: false, error: message });
  }
};

export const deleteAddress = async (
  req: IncomingMessage,
  res: ServerResponse,
  addressId: string
): Promise<void> => {
  try {
    const customer = await authenticateRequest(req, res);
    if (!customer) return;

    if (!addressId || !addressId.trim()) {
      sendJson(res, 400, { success: false, error: 'Address ID is required' });
      return;
    }

    await addressService.deleteAddress(customer.id, addressId);

    sendJson(res, 200, {
      success: true,
      message: 'Address deleted successfully',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.startsWith('ADDRESS_NOT_FOUND')) {
      sendJson(res, 404, { success: false, error: 'Address not found' });
      return;
    }
    sendJson(res, 400, { success: false, error: message });
  }
};

export const setDefaultAddress = async (
  req: IncomingMessage,
  res: ServerResponse,
  addressId: string
): Promise<void> => {
  try {
    const customer = await authenticateRequest(req, res);
    if (!customer) return;

    if (!addressId || !addressId.trim()) {
      sendJson(res, 400, { success: false, error: 'Address ID is required' });
      return;
    }

    const updated = await addressService.setDefaultAddress(customer.id, addressId);

    sendJson(res, 200, {
      success: true,
      message: 'Default address updated successfully',
      data: updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.startsWith('ADDRESS_NOT_FOUND')) {
      sendJson(res, 404, { success: false, error: 'Address not found' });
      return;
    }
    sendJson(res, 400, { success: false, error: message });
  }
};
