import type { IncomingMessage, ServerResponse } from 'node:http';
import * as customerController from '../controllers/customer.controller.ts';
import { sendJson } from '../middleware/http.middleware.ts';

export const handleCustomerRoutes = async (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> => {
  const pathname = url.pathname;
  const method = req.method?.toUpperCase();

  // POST /api/auth/register
  if (pathname === '/api/auth/register') {
    if (method === 'POST') {
      await customerController.register(req, res);
      return true;
    }
    sendJson(res, 405, { success: false, error: `Method ${method} Not Allowed on /api/auth/register` });
    return true;
  }

  // POST /api/auth/login
  if (pathname === '/api/auth/login') {
    if (method === 'POST') {
      await customerController.login(req, res);
      return true;
    }
    sendJson(res, 405, { success: false, error: `Method ${method} Not Allowed on /api/auth/login` });
    return true;
  }

  // POST /api/auth/logout
  if (pathname === '/api/auth/logout') {
    if (method === 'POST') {
      await customerController.logout(req, res);
      return true;
    }
    sendJson(res, 405, { success: false, error: `Method ${method} Not Allowed on /api/auth/logout` });
    return true;
  }

  // GET & PUT /api/auth/me or /api/auth/profile
  if (pathname === '/api/auth/me' || pathname === '/api/auth/profile') {
    if (method === 'GET') {
      await customerController.getProfile(req, res);
      return true;
    }
    if (method === 'PUT') {
      await customerController.updateProfile(req, res);
      return true;
    }
    sendJson(res, 405, { success: false, error: `Method ${method} Not Allowed on ${pathname}` });
    return true;
  }

  // Not an auth/customer route
  return false;
};
