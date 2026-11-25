import type { IncomingMessage, ServerResponse } from 'node:http';
import * as cartController from '../controllers/cart.controller.ts';
import { sendJson } from '../middleware/http.middleware.ts';

export const handleCartRoutes = async (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> => {
  const pathname = url.pathname;
  const method = req.method?.toUpperCase();

  // Root cart route: /api/cart
  if (pathname === '/api/cart') {
    if (method === 'GET') {
      await cartController.getCart(req, res, url);
      return true;
    }

    if (method === 'POST') {
      await cartController.addItem(req, res, url);
      return true;
    }

    if (method === 'PUT') {
      await cartController.updateItem(req, res, url);
      return true;
    }

    if (method === 'DELETE') {
      if (url.searchParams.has('productId')) {
        await cartController.removeItem(req, res, url);
      } else {
        await cartController.clear(req, res, url);
      }
      return true;
    }

    sendJson(res, 405, { success: false, error: `Method ${method} Not Allowed on /api/cart` });
    return true;
  }

  // Explicit clear route: /api/cart/clear
  if (pathname === '/api/cart/clear' && method === 'DELETE') {
    await cartController.clear(req, res, url);
    return true;
  }

  // Cart items route: /api/cart/items/:productId
  if (pathname.startsWith('/api/cart/items/')) {
    const productId = decodeURIComponent(pathname.slice('/api/cart/items/'.length).trim());
    if (!productId || productId.includes('/')) {
      sendJson(res, 404, { success: false, error: 'Endpoint Not Found' });
      return true;
    }

    if (method === 'PUT') {
      await cartController.updateItem(req, res, url, undefined, productId);
      return true;
    }

    if (method === 'DELETE') {
      await cartController.removeItem(req, res, url, undefined, productId);
      return true;
    }

    sendJson(res, 405, { success: false, error: `Method ${method} Not Allowed on /api/cart/items/:productId` });
    return true;
  }

  // Nested cart route: /api/cart/:param1 or /api/cart/:customerId/:productId
  if (pathname.startsWith('/api/cart/')) {
    const parts = pathname
      .slice('/api/cart/'.length)
      .split('/')
      .map((p) => decodeURIComponent(p.trim()))
      .filter(Boolean);

    // /api/cart/:customerId
    if (parts.length === 1) {
      const customerId = parts[0]!;

      if (method === 'GET') {
        await cartController.getCart(req, res, url, customerId);
        return true;
      }

      if (method === 'POST') {
        await cartController.addItem(req, res, url, customerId);
        return true;
      }

      if (method === 'PUT') {
        await cartController.updateItem(req, res, url, customerId);
        return true;
      }

      if (method === 'DELETE') {
        if (url.searchParams.has('productId')) {
          await cartController.removeItem(req, res, url, customerId);
        } else {
          await cartController.clear(req, res, url, customerId);
        }
        return true;
      }

      sendJson(res, 405, { success: false, error: `Method ${method} Not Allowed on /api/cart/:customerId` });
      return true;
    }

    // /api/cart/:customerId/:productId
    if (parts.length === 2) {
      const customerId = parts[0]!;
      const productId = parts[1]!;

      if (method === 'PUT') {
        await cartController.updateItem(req, res, url, customerId, productId);
        return true;
      }

      if (method === 'DELETE') {
        await cartController.removeItem(req, res, url, customerId, productId);
        return true;
      }

      sendJson(res, 405, {
        success: false,
        error: `Method ${method} Not Allowed on /api/cart/:customerId/:productId`,
      });
      return true;
    }

    sendJson(res, 404, { success: false, error: 'Endpoint Not Found' });
    return true;
  }

  // Not a cart route
  return false;
};

