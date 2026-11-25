import type { IncomingMessage, ServerResponse } from 'node:http';
import * as orderService from '../services/order.service.ts';
import * as customerService from '../services/customer.service.ts';
import type { CreateOrderInput } from '../types/order.types.ts';
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

export const createOrder = async (
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> => {
  try {
    const customer = await authenticateRequest(req, res);
    if (!customer) return;

    const body = await parseJsonBody<CreateOrderInput>(req);
    if (!body || typeof body !== 'object') {
      sendJson(res, 400, {
        success: false,
        error: 'Invalid or empty JSON request body',
      });
      return;
    }

    const deliveryAddressId =
      body.deliveryAddressId ||
      (body as any).shippingAddressId ||
      (body as any).deliveryAddress?.id ||
      (body as any).shippingAddress?.id;

    if (!deliveryAddressId || typeof deliveryAddressId !== 'string' || !deliveryAddressId.trim()) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'deliveryAddressId' is required and must be a non-empty string",
      });
      return;
    }

    const order = await orderService.createOrder(customer, {
      ...body,
      deliveryAddressId: deliveryAddressId.trim(),
    });

    sendJson(res, 201, {
      success: true,
      message: 'Order placed successfully',
      data: order,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.startsWith('PRODUCT_NOT_FOUND')) {
      sendJson(res, 404, { success: false, error: message });
      return;
    }
    if (
      message.startsWith('EMPTY_CART') ||
      message.startsWith('DELIVERY_ADDRESS_NOT_FOUND') ||
      message.startsWith('OUT_OF_STOCK') ||
      message.startsWith('INSUFFICIENT_STOCK') ||
      message.startsWith('PRODUCT_NOT_AVAILABLE') ||
      message.startsWith('Validation failed')
    ) {
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

export const getOrders = async (
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> => {
  try {
    const customer = await authenticateRequest(req, res);
    if (!customer) return;

    const orders = await orderService.getOrdersByCustomer(customer.id);
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

export const getOrderDetails = async (
  req: IncomingMessage,
  res: ServerResponse,
  orderId: string
): Promise<void> => {
  try {
    const customer = await authenticateRequest(req, res);
    if (!customer) return;

    if (!orderId || !orderId.trim()) {
      sendJson(res, 400, { success: false, error: 'Order ID is required' });
      return;
    }

    const order = await orderService.getOrderById(customer.id, orderId);
    if (!order) {
      sendJson(res, 404, {
        success: false,
        error: `Order with ID '${orderId}' not found`,
      });
      return;
    }

    sendJson(res, 200, {
      success: true,
      data: order,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendJson(res, 500, { success: false, error: message });
  }
};

export const cancelOrder = async (
  req: IncomingMessage,
  res: ServerResponse,
  orderId: string
): Promise<void> => {
  try {
    const customer = await authenticateRequest(req, res);
    if (!customer) return;

    if (!orderId || !orderId.trim()) {
      sendJson(res, 400, { success: false, error: 'Order ID is required' });
      return;
    }

    const order = await orderService.cancelOrder(customer.id, orderId);

    sendJson(res, 200, {
      success: true,
      message: 'Order cancelled successfully',
      data: order,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.startsWith('ORDER_NOT_FOUND')) {
      sendJson(res, 404, { success: false, error: 'Order not found' });
      return;
    }
    if (
      message.startsWith('ORDER_ALREADY_CANCELLED') ||
      message.startsWith('ORDER_CANNOT_BE_CANCELLED')
    ) {
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
