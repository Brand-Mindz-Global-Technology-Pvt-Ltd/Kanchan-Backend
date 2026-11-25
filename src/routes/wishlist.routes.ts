import type { IncomingMessage, ServerResponse } from 'node:http';
import * as wishlistController from '../controllers/wishlist.controller.ts';
import { sendJson } from '../middleware/http.middleware.ts';

export const handleWishlistRoutes = async (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> => {
  const pathname = url.pathname;
  const method = req.method?.toUpperCase();

  // Root wishlist route: /api/wishlist
  if (pathname === '/api/wishlist') {
    if (method === 'GET') {
      await wishlistController.getWishlist(req, res, url);
      return true;
    }

    if (method === 'POST') {
      await wishlistController.addItem(req, res, url);
      return true;
    }

    if (method === 'DELETE') {
      await wishlistController.removeItem(req, res, url);
      return true;
    }

    sendJson(res, 405, { success: false, error: `Method ${method} Not Allowed on /api/wishlist` });
    return true;
  }

  // Nested routes: /api/wishlist/:customerId or /api/wishlist/:customerId/:productId
  if (pathname.startsWith('/api/wishlist/')) {
    const parts = pathname
      .slice('/api/wishlist/'.length)
      .split('/')
      .map((p) => decodeURIComponent(p.trim()))
      .filter(Boolean);

    // /api/wishlist/:customerId
    if (parts.length === 1) {
      const customerId = parts[0]!;

      if (method === 'GET') {
        await wishlistController.getWishlist(req, res, url, customerId);
        return true;
      }

      if (method === 'POST') {
        await wishlistController.addItem(req, res, url, customerId);
        return true;
      }

      sendJson(res, 405, { success: false, error: `Method ${method} Not Allowed on /api/wishlist/:customerId` });
      return true;
    }

    // /api/wishlist/:customerId/:productId
    if (parts.length === 2) {
      const customerId = parts[0]!;
      const productId = parts[1]!;

      if (method === 'DELETE') {
        await wishlistController.removeItem(req, res, url, customerId, productId);
        return true;
      }

      sendJson(res, 405, {
        success: false,
        error: `Method ${method} Not Allowed on /api/wishlist/:customerId/:productId`,
      });
      return true;
    }

    sendJson(res, 404, { success: false, error: 'Endpoint Not Found' });
    return true;
  }

  // Not a wishlist route
  return false;
};

