import type { IncomingMessage, ServerResponse } from 'node:http';
import * as orderController from '../controllers/order.controller.ts';
import { sendJson } from '../middleware/http.middleware.ts';

export const handleOrderRoutes = async (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> => {
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method?.toUpperCase();

  // /api/orders
  if (pathname === '/api/orders') {
    if (method === 'GET') {
      await orderController.getOrders(req, res);
      return true;
    }
    if (method === 'POST') {
      await orderController.createOrder(req, res);
      return true;
    }
    sendJson(res, 405, {
      success: false,
      error: `Method ${method} Not Allowed on /api/orders`,
    });
    return true;
  }

  // /api/orders/:id or /api/orders/:id/cancel
  if (pathname.startsWith('/api/orders/')) {
    const subPath = pathname.slice('/api/orders/'.length);
    const parts = subPath.split('/');

    // Single segment: :id
    if (parts.length === 1 && parts[0]) {
      const orderId = decodeURIComponent(parts[0]);
      if (method === 'GET') {
        await orderController.getOrderDetails(req, res, orderId);
        return true;
      }
      sendJson(res, 405, {
        success: false,
        error: `Method ${method} Not Allowed on /api/orders/${orderId}`,
      });
      return true;
    }

    // Two segments: :id/cancel
    if (parts.length === 2 && parts[0] && parts[1] === 'cancel') {
      const orderId = decodeURIComponent(parts[0]);
      if (method === 'POST' || method === 'PUT') {
        await orderController.cancelOrder(req, res, orderId);
        return true;
      }
      sendJson(res, 405, {
        success: false,
        error: `Method ${method} Not Allowed on /api/orders/${orderId}/cancel`,
      });
      return true;
    }
  }

  // Not an order route
  return false;
};

