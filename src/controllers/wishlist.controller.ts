import type { IncomingMessage, ServerResponse } from 'node:http';
import * as wishlistService from '../services/wishlist.service.ts';
import * as customerService from '../services/customer.service.ts';
import type { AddToWishlistInput } from '../types/wishlist.types.ts';
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
        message: "Forbidden: Cannot access or modify another customer's wishlist",
        error: "Forbidden: Cannot access or modify another customer's wishlist",
      });
      return false;
    }
  }
  return true;
}

export const getWishlist = async (
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

    const wishlist = await wishlistService.getWishlist(customer.id);
    sendJson(res, 200, {
      success: true,
      count: wishlist.count,
      data: wishlist,
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

    const body = await parseJsonBody<AddToWishlistInput>(req);
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

    const result = await wishlistService.addToWishlist(customer.id, body.productId.trim());

    sendJson(res, 201, {
      success: true,
      message: 'Product added to wishlist successfully',
      data: result.wishlist,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.startsWith('PRODUCT_NOT_FOUND')) {
      sendJson(res, 404, { success: false, error: message });
      return;
    }
    if (message.startsWith('DUPLICATE_ITEM')) {
      sendJson(res, 400, { success: false, error: message });
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

    let productId = pathProductId || url.searchParams.get('productId');
    if (!productId) {
      try {
        const body = await parseJsonBody<{ productId?: string }>(req);
        if (body?.productId) {
          productId = body.productId;
        }
      } catch {
        // Body parsing optional
      }
    }

    if (!productId || typeof productId !== 'string' || !productId.trim()) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'productId' is required in URL path or query parameter",
      });
      return;
    }

    const updated = await wishlistService.removeFromWishlist(customer.id, productId.trim());
    if (!updated) {
      sendJson(res, 404, {
        success: false,
        error: `Product with ID '${productId}' not found in wishlist for customer '${customer.id}'`,
      });
      return;
    }

    sendJson(res, 200, {
      success: true,
      message: `Product with ID '${productId}' removed from wishlist successfully`,
      data: updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendJson(res, 500, { success: false, error: message });
  }
};
