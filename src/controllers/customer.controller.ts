import type { IncomingMessage, ServerResponse } from 'node:http';
import * as customerService from '../services/customer.service.ts';
import type {
  RegisterCustomerInput,
  LoginCustomerInput,
  UpdateCustomerProfileInput,
  SafeCustomer,
} from '../types/customer.types.ts';
import { sendJson, parseJsonBody } from '../middleware/http.middleware.ts';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function extractBearerToken(req: IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7).trim();
}

async function authenticateRequest(req: IncomingMessage): Promise<SafeCustomer | null> {
  const token = extractBearerToken(req);
  if (!token) {
    return null;
  }
  const customer = await customerService.verifySessionToken(token);
  return customer ?? null;
}

export const register = async (
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> => {
  try {
    const body = await parseJsonBody<RegisterCustomerInput>(req);
    if (!body || typeof body !== 'object') {
      sendJson(res, 400, {
        success: false,
        error: 'Invalid or empty JSON request body',
      });
      return;
    }

    // Validate full name
    if (!body.fullName || typeof body.fullName !== 'string' || !body.fullName.trim()) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'fullName' is required and must be a non-empty string",
      });
      return;
    }

    // Validate email presence
    if (!body.email || typeof body.email !== 'string' || !body.email.trim()) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'email' is required",
      });
      return;
    }

    // Validate email format
    const trimmedEmail = body.email.trim();
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'email' must be a valid email address format",
      });
      return;
    }

    // Validate password
    if (!body.password || typeof body.password !== 'string') {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'password' is required",
      });
      return;
    }

    if (body.password.length < 6) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'password' must be at least 6 characters long",
      });
      return;
    }

    // Check optional confirm password match
    if (body.confirmPassword !== undefined && body.confirmPassword !== body.password) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'password' and 'confirmPassword' do not match",
      });
      return;
    }

    const safeCustomer = await customerService.registerCustomer({
      fullName: body.fullName,
      email: trimmedEmail,
      password: body.password,
      mobileNumber: body.mobileNumber,
      gender: body.gender,
      address: body.address,
    });

    sendJson(res, 201, {
      success: true,
      message: 'Customer registered successfully',
      data: safeCustomer,
    });
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string };
    const message = err?.message || 'Unknown error';
    if (message.startsWith('EMAIL_ALREADY_EXISTS') || err?.code === 'ER_DUP_ENTRY') {
      sendJson(res, 400, {
        success: false,
        error: message.startsWith('EMAIL_ALREADY_EXISTS')
          ? message
          : 'EMAIL_ALREADY_EXISTS: An account with this email already exists',
      });
      return;
    }
    sendJson(res, 400, { success: false, error: message });
  }
};

export const login = async (
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> => {
  try {
    const body = await parseJsonBody<LoginCustomerInput>(req);
    if (!body || typeof body !== 'object') {
      sendJson(res, 400, {
        success: false,
        error: 'Invalid or empty JSON request body',
      });
      return;
    }

    if (!body.email || typeof body.email !== 'string' || !body.email.trim()) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'email' is required",
      });
      return;
    }

    const trimmedEmail = body.email.trim();
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'email' must be a valid email address format",
      });
      return;
    }

    if (!body.password || typeof body.password !== 'string') {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'password' is required",
      });
      return;
    }

    const authData = await customerService.loginCustomer({
      email: trimmedEmail,
      password: body.password,
    });

    sendJson(res, 200, {
      success: true,
      message: 'Login successful',
      data: authData,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    const message = err?.message || 'Unknown error';
    if (message.startsWith('INVALID_CREDENTIALS')) {
      sendJson(res, 401, { success: false, error: 'Invalid email or password' });
      return;
    }
    sendJson(res, 400, { success: false, error: message });
  }
};

export const getProfile = async (
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> => {
  try {
    const customer = await authenticateRequest(req);
    if (!customer) {
      sendJson(res, 401, {
        success: false,
        error: 'Unauthorized: Invalid, missing, or expired session token',
      });
      return;
    }

    sendJson(res, 200, {
      success: true,
      data: customer,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    const message = err?.message || 'Unknown error';
    sendJson(res, 500, { success: false, error: message });
  }
};

export const updateProfile = async (
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> => {
  try {
    const customer = await authenticateRequest(req);
    if (!customer) {
      sendJson(res, 401, {
        success: false,
        error: 'Unauthorized: Invalid, missing, or expired session token',
      });
      return;
    }

    const body = await parseJsonBody<UpdateCustomerProfileInput>(req);
    if (!body || typeof body !== 'object') {
      sendJson(res, 400, {
        success: false,
        error: 'Invalid or empty JSON request body',
      });
      return;
    }

    // Validate submitted fields
    if (body.fullName !== undefined) {
      if (typeof body.fullName !== 'string' || !body.fullName.trim()) {
        sendJson(res, 400, {
          success: false,
          error: "Validation failed: 'fullName' must be a non-empty string",
        });
        return;
      }
    }

    if (body.email !== undefined) {
      if (typeof body.email !== 'string' || !body.email.trim()) {
        sendJson(res, 400, {
          success: false,
          error: "Validation failed: 'email' must be a non-empty string",
        });
        return;
      }
      if (!EMAIL_REGEX.test(body.email.trim())) {
        sendJson(res, 400, {
          success: false,
          error: "Validation failed: 'email' must be a valid email address format",
        });
        return;
      }
    }

    if (body.mobileNumber !== undefined && typeof body.mobileNumber !== 'string') {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'mobileNumber' must be a string",
      });
      return;
    }

    if (body.gender !== undefined && typeof body.gender !== 'string') {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'gender' must be a string",
      });
      return;
    }

    if (body.address !== undefined && typeof body.address !== 'string') {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'address' must be a string",
      });
      return;
    }

    const updatedCustomer = await customerService.updateCustomerProfile(customer.id, body);

    sendJson(res, 200, {
      success: true,
      message: 'Profile updated successfully',
      data: updatedCustomer,
    });
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string };
    const message = err?.message || 'Unknown error';
    if (message.startsWith('EMAIL_ALREADY_EXISTS') || err?.code === 'ER_DUP_ENTRY') {
      sendJson(res, 400, {
        success: false,
        error: message.startsWith('EMAIL_ALREADY_EXISTS')
          ? message
          : 'EMAIL_ALREADY_EXISTS: Email is already registered to another account',
      });
      return;
    }
    sendJson(res, 400, { success: false, error: message });
  }
};

export const logout = async (
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> => {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      sendJson(res, 401, {
        success: false,
        message: 'Unauthorized',
      });
      return;
    }

    const customer = await customerService.verifySessionToken(token);
    if (!customer) {
      sendJson(res, 401, {
        success: false,
        message: 'Unauthorized',
      });
      return;
    }

    const loggedOut = await customerService.logoutCustomer(token);
    if (!loggedOut) {
      sendJson(res, 401, {
        success: false,
        message: 'Unauthorized',
      });
      return;
    }

    sendJson(res, 200, {
      success: true,
      message: 'Logged out successfully',
    });
  } catch {
    sendJson(res, 500, {
      success: false,
      message: 'Internal server error',
    });
  }
};
