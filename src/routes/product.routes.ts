import type { IncomingMessage, ServerResponse } from 'node:http';
import * as productController from '../controllers/product.controller.ts';
import { authenticateAdminRequest } from '../controllers/admin.controller.ts';
import { sendJson } from '../middleware/http.middleware.ts';

export const handleProductRoutes = async (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> => {
  const pathname = url.pathname;
  const method = req.method?.toUpperCase();

  // Route: /api/products
  if (pathname === '/api/products') {
    if (method === 'GET') {
      await productController.getAll(req, res, url);
      return true;
    }

    if (method === 'POST') {
      const admin = authenticateAdminRequest(req, res);
      if (!admin) return true;

      await productController.create(req, res);
      return true;
    }

    sendJson(res, 405, { success: false, error: `Method ${method} Not Allowed on /api/products` });
    return true;
  }

  // Route: /api/products/:id
  if (pathname.startsWith('/api/products/')) {
    const remainder = pathname.slice('/api/products/'.length).trim();
    // Ensure there are no sub-paths (only /api/products/:id)
    if (!remainder || remainder.includes('/')) {
      sendJson(res, 404, { success: false, error: 'Endpoint Not Found' });
      return true;
    }

    const id = decodeURIComponent(remainder);

    if (method === 'GET') {
      await productController.getById(req, res, id);
      return true;
    }

    if (method === 'PUT') {
      const admin = authenticateAdminRequest(req, res);
      if (!admin) return true;

      await productController.update(req, res, id);
      return true;
    }

    if (method === 'DELETE') {
      const admin = authenticateAdminRequest(req, res);
      if (!admin) return true;

      await productController.remove(req, res, id);
      return true;
    }

    sendJson(res, 405, { success: false, error: `Method ${method} Not Allowed on /api/products/:id` });
    return true;
  }

  // Not a product route
  return false;
};
