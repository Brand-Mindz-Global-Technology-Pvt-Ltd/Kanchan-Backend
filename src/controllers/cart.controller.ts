import type { IncomingMessage, ServerResponse } from 'node:http';
import * as cartService from '../services/cart.service.ts';
import * as customerService from '../services/customer.service.ts';
import type { AddToCartInput, UpdateCartItemInput } from '../types/cart.types.ts';
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

function validateCustomerAccess(
  res: ServerResponse,
  authenticatedCustomerId: string,
  ...claimedIds: (string | undefined | null)[]
): boolean {
  for (const claimed of claimedIds) {
    if (claimed && claimed.trim() && claimed.trim() !== authenticatedCustomerId) {
      sendJson(res, 403, {
        success: false,
        message: "Forbidden: Cannot access or modify another customer's cart",
        error: "Forbidden: Cannot access or modify another customer's cart",
      });
      return false;
    }
  }
  return true;
}

export const getCart = async (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  pathCustomerId?: string
): Promise<void> => {
  try {
    const customer = await authenticateRequest(req, res);
    if (!customer) return;

    const queryCustomerId = url.searchParams.get('customerId') ?? undefined;
    const headerCustomerId = (req.headers['x-customer-id'] as string) ?? undefined;

    if (!validateCustomerAccess(res, customer.id, pathCustomerId, queryCustomerId, headerCustomerId)) {
      return;
    }

    const cart = await cartService.getCart(customer.id);
    sendJson(res, 200, {
      success: true,
      data: cart,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendJson(res, 500, { success: false, error: message });
  }
};

export const addItem = async (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  pathCustomerId?: string
): Promise<void> => {
  try {
    const customer = await authenticateRequest(req, res);
    if (!customer) return;

    const body = await parseJsonBody<AddToCartInput>(req);
    if (!body || typeof body !== 'object') {
      sendJson(res, 400, {
        success: false,
        error: 'Invalid or empty JSON request body',
      });
      return;
    }

    const queryCustomerId = url.searchParams.get('customerId') ?? undefined;
    const headerCustomerId = (req.headers['x-customer-id'] as string) ?? undefined;

    if (
      !validateCustomerAccess(
        res,
        customer.id,
        pathCustomerId,
        queryCustomerId,
        body.customerId,
        headerCustomerId
      )
    ) {
      return;
    }

    if (!body.productId || typeof body.productId !== 'string' || !body.productId.trim()) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'productId' is required and must be a non-empty string",
      });
      return;
    }

    if (body.quantity !== undefined && (typeof body.quantity !== 'number' || body.quantity <= 0 || !Number.isInteger(body.quantity))) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'quantity' must be a positive integer greater than 0",
      });
      return;
    }

    const result = await cartService.addItemToCart(customer.id, body);

    sendJson(res, 200, {
      success: true,
      message: 'Product added to cart successfully',
      data: result.cart,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.startsWith('PRODUCT_NOT_FOUND')) {
      sendJson(res, 404, { success: false, error: message });
      return;
    }
    if (
      message.startsWith('OUT_OF_STOCK') ||
      message.startsWith('STOCK_LIMIT_EXCEEDED') ||
      message.startsWith('INVALID_QUANTITY')
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

export const updateItem = async (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  pathCustomerId?: string,
  pathProductId?: string
): Promise<void> => {
  try {
    const customer = await authenticateRequest(req, res);
    if (!customer) return;

    const body = await parseJsonBody<UpdateCartItemInput>(req);
    if (!body || typeof body !== 'object') {
      sendJson(res, 400, {
        success: false,
        error: 'Invalid or empty JSON request body',
      });
      return;
    }

    const queryCustomerId = url.searchParams.get('customerId') ?? undefined;
    const headerCustomerId = (req.headers['x-customer-id'] as string) ?? undefined;

    if (
      !validateCustomerAccess(
        res,
        customer.id,
        pathCustomerId,
        queryCustomerId,
        body.customerId,
        headerCustomerId
      )
    ) {
      return;
    }

    const productId = pathProductId || body.productId || url.searchParams.get('productId');

    if (!productId || typeof productId !== 'string' || !productId.trim()) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'productId' is required in URL or request body",
      });
      return;
    }

    if (typeof body.quantity !== 'number' || body.quantity < 0 || !Number.isInteger(body.quantity)) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'quantity' must be a non-negative integer (0 or greater)",
      });
      return;
    }

    const variant = body.variant !== undefined ? body.variant : (url.searchParams.get('variant') ?? undefined);
    const potType = body.potType !== undefined ? body.potType : (url.searchParams.get('potType') ?? undefined);
    const updated = await cartService.updateCartItemQuantity(customer.id, productId.trim(), body.quantity, variant, potType);
    if (!updated) {
      sendJson(res, 404, {
        success: false,
        error: `Item with productId '${productId}' not found in cart for customer '${customer.id}'`,
      });
      return;
    }

    sendJson(res, 200, {
      success: true,
      message: 'Cart item updated successfully',
      data: updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.startsWith('PRODUCT_NOT_FOUND')) {
      sendJson(res, 404, { success: false, error: message });
      return;
    }
    if (
      message.startsWith('OUT_OF_STOCK') ||
      message.startsWith('STOCK_LIMIT_EXCEEDED') ||
      message.startsWith('INVALID_QUANTITY')
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

export const removeItem = async (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  pathCustomerId?: string,
  pathProductId?: string
): Promise<void> => {
  try {
    const customer = await authenticateRequest(req, res);
    if (!customer) return;

    const queryCustomerId = url.searchParams.get('customerId') ?? undefined;
    const headerCustomerId = (req.headers['x-customer-id'] as string) ?? undefined;

    if (!validateCustomerAccess(res, customer.id, pathCustomerId, queryCustomerId, headerCustomerId)) {
      return;
    }

    const productId = pathProductId || url.searchParams.get('productId');

    if (!productId || typeof productId !== 'string' || !productId.trim()) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'productId' is required to remove an item",
      });
      return;
    }

    const variant = url.searchParams.get('variant') || undefined;
    const potType = url.searchParams.get('potType') || undefined;
    const updated = await cartService.removeCartItem(customer.id, productId.trim(), variant, potType);
    if (!updated) {
      sendJson(res, 404, {
        success: false,
        error: `Item with productId '${productId}' not found in cart for customer '${customer.id}'`,
      });
      return;
    }

    sendJson(res, 200, {
      success: true,
      message: `Item with productId '${productId}' removed from cart`,
      data: updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendJson(res, 500, { success: false, error: message });
  }
};

export const clear = async (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  pathCustomerId?: string
): Promise<void> => {
  try {
    const customer = await authenticateRequest(req, res);
    if (!customer) return;

    const queryCustomerId = url.searchParams.get('customerId') ?? undefined;
    const headerCustomerId = (req.headers['x-customer-id'] as string) ?? undefined;

    if (!validateCustomerAccess(res, customer.id, pathCustomerId, queryCustomerId, headerCustomerId)) {
      return;
    }

    const cart = await cartService.clearCart(customer.id);
    sendJson(res, 200, {
      success: true,
      message: `Cart cleared successfully for customer '${customer.id}'`,
      data: cart,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendJson(res, 500, { success: false, error: message });
  }
};
