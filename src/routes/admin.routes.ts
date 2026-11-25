import type { IncomingMessage, ServerResponse } from 'node:http';
import * as adminController from '../controllers/admin.controller.ts';
import { sendJson } from '../middleware/http.middleware.ts';

export const handleAdminRoutes = async (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> => {
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method?.toUpperCase();

  // POST /api/admin/auth/login
  if (pathname === '/api/admin/auth/login') {
    if (method === 'POST') {
      await adminController.login(req, res);
      return true;
    }
    sendJson(res, 405, { success: false, error: `Method ${method} Not Allowed on /api/admin/auth/login` });
    return true;
  }

  // POST /api/admin/auth/logout
  if (pathname === '/api/admin/auth/logout') {
    if (method === 'POST') {
      await adminController.logout(req, res);
      return true;
    }
    sendJson(res, 405, { success: false, error: `Method ${method} Not Allowed on /api/admin/auth/logout` });
    return true;
  }

  // GET /api/admin/auth/me
  if (pathname === '/api/admin/auth/me') {
    if (method === 'GET') {
      await adminController.getMe(req, res);
      return true;
    }
    sendJson(res, 405, { success: false, error: `Method ${method} Not Allowed on /api/admin/auth/me` });
    return true;
  }

  // GET /api/admin/orders
  if (pathname === '/api/admin/orders') {
    if (method === 'GET') {
      await adminController.getAdminOrders(req, res, url);
      return true;
    }
    sendJson(res, 405, { success: false, error: `Method ${method} Not Allowed on /api/admin/orders` });
    return true;
  }

  // PATCH /api/admin/orders/:id/status
  const orderStatusMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/status$/);
  if (orderStatusMatch) {
    if (method === 'PATCH') {
      const orderId = decodeURIComponent(orderStatusMatch[1]!);
      await adminController.updateAdminOrderStatus(req, res, orderId);
      return true;
    }
    sendJson(res, 405, { success: false, error: `Method ${method} Not Allowed on ${pathname}` });
    return true;
  }

  // GET /api/admin/customers
  if (pathname === '/api/admin/customers') {
    if (method === 'GET') {
      await adminController.getAdminCustomers(req, res, url);
      return true;
    }
    sendJson(res, 405, { success: false, error: `Method ${method} Not Allowed on /api/admin/customers` });
    return true;
  }

  // GET /api/admin/customers/:id
  const customerDetailsMatch = pathname.match(/^\/api\/admin\/customers\/([^/]+)$/);
  if (customerDetailsMatch) {
    if (method === 'GET') {
      const customerId = decodeURIComponent(customerDetailsMatch[1]!);
      await adminController.getAdminCustomerDetails(req, res, customerId);
      return true;
    }
    sendJson(res, 405, { success: false, error: `Method ${method} Not Allowed on ${pathname}` });
    return true;
  }

  // Not an admin route
  return false;
};

