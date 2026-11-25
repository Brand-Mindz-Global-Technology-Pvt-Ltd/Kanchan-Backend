import type { IncomingMessage, ServerResponse } from 'node:http';
import * as adminService from '../services/admin.service.ts';
import * as orderService from '../services/order.service.ts';
import * as customerService from '../services/customer.service.ts';
import * as addressService from '../services/address.service.ts';
import type { AdminLoginInput, SafeAdmin } from '../types/admin.types.ts';
import type { AdminCustomerDetails } from '../types/customer.types.ts';
import { ORDER_STATUSES, type OrderStatus, type UpdateOrderStatusInput } from '../types/order.types.ts';
import { sendJson, parseJsonBody } from '../middleware/http.middleware.ts';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function extractBearerToken(req: IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7).trim();
}

export function authenticateAdminRequest(
  req: IncomingMessage,
  res: ServerResponse
): SafeAdmin | null {
  const token = extractBearerToken(req);
  if (!token) {
    sendJson(res, 401, {
      success: false,
      message: 'Unauthorized',
      error: 'Unauthorized: Admin authentication token required',
    });
    return null;
  }

  const admin = adminService.verifyAdminSessionToken(token);
  if (!admin) {
    sendJson(res, 401, {
      success: false,
      message: 'Unauthorized',
      error: 'Unauthorized: Invalid, missing, or expired admin token',
    });
    return null;
  }

  return admin;
}

export const login = async (
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> => {
  try {
    const body = await parseJsonBody<AdminLoginInput>(req);
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
        error: "Validation failed: 'email' must be a valid email format",
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

    const authData = adminService.loginAdmin({
      email: trimmedEmail,
      password: body.password,
    });

    sendJson(res, 200, {
      success: true,
      message: 'Admin login successful',
      data: authData,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.startsWith('INVALID_CREDENTIALS')) {
      sendJson(res, 401, {
        success: false,
        error: 'Invalid admin email or password',
        message: 'Invalid admin email or password',
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
        error: 'Unauthorized: Admin authentication token required',
      });
      return;
    }

    const admin = adminService.verifyAdminSessionToken(token);
    if (!admin) {
      sendJson(res, 401, {
        success: false,
        message: 'Unauthorized',
        error: 'Unauthorized: Invalid, missing, or expired admin token',
      });
      return;
    }

    adminService.logoutAdmin(token);

    sendJson(res, 200, {
      success: true,
      message: 'Admin logged out successfully',
    });
  } catch (error) {
    sendJson(res, 500, {
      success: false,
      message: 'Internal server error',
    });
  }
};

export const getMe = async (
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> => {
  try {
    const admin = authenticateAdminRequest(req, res);
    if (!admin) return;

    sendJson(res, 200, {
      success: true,
      data: admin,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendJson(res, 500, { success: false, error: message });
  }
};

export const getAdminOrders = async (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<void> => {
  try {
    const admin = authenticateAdminRequest(req, res);
    if (!admin) return;

    const statusParam = url.searchParams.get('status') || undefined;
    if (statusParam) {
      const normalized = statusParam.trim().toLowerCase();
      if (!ORDER_STATUSES.includes(normalized as OrderStatus)) {
        sendJson(res, 400, {
          success: false,
          error: `Validation failed: Invalid status '${statusParam}'. Valid statuses are: ${ORDER_STATUSES.join(', ')}`,
        });
        return;
      }
    }

    const orders = await orderService.getAllOrders(statusParam);
    sendJson(res, 200, {
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendJson(res, 500, { success: false, error: message });
  }
};

export const updateAdminOrderStatus = async (
  req: IncomingMessage,
  res: ServerResponse,
  orderId: string
): Promise<void> => {
  try {
    const admin = authenticateAdminRequest(req, res);
    if (!admin) return;

    if (!orderId || !orderId.trim()) {
      sendJson(res, 400, { success: false, error: 'Order ID is required' });
      return;
    }

    const body = await parseJsonBody<UpdateOrderStatusInput>(req);
    if (!body || typeof body !== 'object') {
      sendJson(res, 400, {
        success: false,
        error: 'Invalid or empty JSON request body',
      });
      return;
    }

    if (!body.status || typeof body.status !== 'string' || !body.status.trim()) {
      sendJson(res, 400, {
        success: false,
        error: `Validation failed: 'status' is required and must be one of: ${ORDER_STATUSES.join(', ')}`,
      });
      return;
    }

    const normalizedStatus = body.status.trim().toLowerCase() as OrderStatus;
    if (!ORDER_STATUSES.includes(normalizedStatus)) {
      sendJson(res, 400, {
        success: false,
        error: `Validation failed: Invalid status '${body.status}'. Valid statuses are: ${ORDER_STATUSES.join(', ')}`,
      });
      return;
    }

    const updatedOrder = await orderService.updateOrderStatusByAdmin(orderId, normalizedStatus);

    sendJson(res, 200, {
      success: true,
      message: `Order status updated to '${normalizedStatus}' successfully`,
      data: updatedOrder,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.startsWith('ORDER_NOT_FOUND')) {
      sendJson(res, 404, { success: false, error: message });
      return;
    }
    if (message.startsWith('ORDER_ALREADY_CANCELLED')) {
      sendJson(res, 400, {
        success: false,
        error: message,
        message: message.replace(/^[A-Z_]+:\s*/, ''),
      });
      return;
    }
    sendJson(res, 400, { success: false, error: message });
  }
};

export const getAdminCustomers = async (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<void> => {
  try {
    const admin = authenticateAdminRequest(req, res);
    if (!admin) return;

    const searchParam = url.searchParams.get('search') || undefined;
    const customers = await customerService.getAllCustomers(searchParam);

    sendJson(res, 200, {
      success: true,
      count: customers.length,
      data: customers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendJson(res, 500, { success: false, error: message });
  }
};

export const getAdminCustomerDetails = async (
  req: IncomingMessage,
  res: ServerResponse,
  customerId: string
): Promise<void> => {
  try {
    const admin = authenticateAdminRequest(req, res);
    if (!admin) return;

    if (!customerId || !customerId.trim()) {
      sendJson(res, 400, { success: false, error: 'Customer ID is required' });
      return;
    }

    const trimmedId = customerId.trim();
    const customer = await customerService.findCustomerById(trimmedId);
    if (!customer) {
      sendJson(res, 404, { success: false, error: 'Customer not found' });
      return;
    }

    const [addresses, orders] = await Promise.all([
      addressService.getAddressesByCustomer(trimmedId),
      orderService.getOrdersByCustomer(trimmedId),
    ]);

    const totalOrders = orders.length;
    const totalSpent = Number(
      orders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0).toFixed(2)
    );

    const responseData: AdminCustomerDetails = {
      ...customer,
      totalOrders,
      totalSpent,
      addresses,
      orders,
    };

    sendJson(res, 200, {
      success: true,
      data: responseData,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendJson(res, 500, { success: false, error: message });
  }
};


