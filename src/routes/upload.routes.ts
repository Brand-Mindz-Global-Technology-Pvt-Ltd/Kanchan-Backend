import type { IncomingMessage, ServerResponse } from 'node:http';
import * as uploadController from '../controllers/upload.controller.ts';
import { sendJson } from '../middleware/http.middleware.ts';

export const handleUploadRoutes = async (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> => {
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method?.toUpperCase();

  // 1. POST /api/admin/uploads/categories
  if (pathname === '/api/admin/uploads/categories') {
    if (method === 'POST') {
      await uploadController.uploadCategoryImage(req, res);
      return true;
    }
    sendJson(res, 405, {
      success: false,
      error: `Method ${method} Not Allowed on /api/admin/uploads/categories`,
    });
    return true;
  }

  // 2. POST /api/admin/uploads/products
  if (pathname === '/api/admin/uploads/products') {
    if (method === 'POST') {
      await uploadController.uploadProductImage(req, res);
      return true;
    }
    sendJson(res, 405, {
      success: false,
      error: `Method ${method} Not Allowed on /api/admin/uploads/products`,
    });
    return true;
  }

  // 3. GET / HEAD /uploads/categories/<filename>
  if (url.pathname.startsWith('/uploads/categories/')) {
    await uploadController.serveCategoryImage(req, res, url.pathname);
    return true;
  }

  // 4. GET / HEAD /uploads/products/<filename>
  if (url.pathname.startsWith('/uploads/products/')) {
    await uploadController.serveProductImage(req, res, url.pathname);
    return true;
  }

  return false;
};
