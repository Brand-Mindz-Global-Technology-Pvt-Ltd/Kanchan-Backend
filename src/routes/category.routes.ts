import type { IncomingMessage, ServerResponse } from 'node:http';
import * as categoryController from '../controllers/category.controller.ts';
import { authenticateAdminRequest } from '../controllers/admin.controller.ts';
import { sendJson } from '../middleware/http.middleware.ts';

export const handleCategoryRoutes = async (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> => {
  const pathname = url.pathname;
  const method = req.method?.toUpperCase();

  // Route: /api/categories
  if (pathname === '/api/categories') {
    if (method === 'GET') {
      await categoryController.getAll(req, res, url);
      return true;
    }

    if (method === 'POST') {
      const admin = authenticateAdminRequest(req, res);
      if (!admin) return true;

      await categoryController.create(req, res);
      return true;
    }

    sendJson(res, 405, { success: false, error: `Method ${method} Not Allowed on /api/categories` });
    return true;
  }

  // Route: /api/categories/:id
  if (pathname.startsWith('/api/categories/')) {
    const remainder = pathname.slice('/api/categories/'.length).trim();
    // Ensure there are no sub-paths (only /api/categories/:id)
    if (!remainder || remainder.includes('/')) {
      sendJson(res, 404, { success: false, error: 'Endpoint Not Found' });
      return true;
    }

    const id = decodeURIComponent(remainder);

    if (method === 'GET') {
      await categoryController.getById(req, res, id);
      return true;
    }

    if (method === 'PUT') {
      const admin = authenticateAdminRequest(req, res);
      if (!admin) return true;

      await categoryController.update(req, res, id);
      return true;
    }

    if (method === 'DELETE') {
      const admin = authenticateAdminRequest(req, res);
      if (!admin) return true;

      await categoryController.remove(req, res, id);
      return true;
    }

    sendJson(res, 405, { success: false, error: `Method ${method} Not Allowed on /api/categories/:id` });
    return true;
  }

  // Not a category route
  return false;
};

