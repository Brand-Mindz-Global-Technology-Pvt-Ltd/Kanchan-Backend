import type { IncomingMessage, ServerResponse } from 'node:http';
import * as addressController from '../controllers/address.controller.ts';
import { sendJson } from '../middleware/http.middleware.ts';

export const handleAddressRoutes = async (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> => {
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method?.toUpperCase();

  // /api/customer/addresses
  if (pathname === '/api/customer/addresses') {
    if (method === 'GET') {
      await addressController.getAddresses(req, res);
      return true;
    }
    if (method === 'POST') {
      await addressController.createAddress(req, res);
      return true;
    }
    sendJson(res, 405, {
      success: false,
      error: `Method ${method} Not Allowed on /api/customer/addresses`,
    });
    return true;
  }

  // /api/customer/addresses/:id or /api/customer/addresses/:id/default
  if (pathname.startsWith('/api/customer/addresses/')) {
    const subPath = pathname.slice('/api/customer/addresses/'.length);
    const parts = subPath.split('/');

    // Single segment: :id
    if (parts.length === 1 && parts[0]) {
      const addressId = decodeURIComponent(parts[0]);
      if (method === 'PUT') {
        await addressController.updateAddress(req, res, addressId);
        return true;
      }
      if (method === 'DELETE') {
        await addressController.deleteAddress(req, res, addressId);
        return true;
      }
      sendJson(res, 405, {
        success: false,
        error: `Method ${method} Not Allowed on /api/customer/addresses/${addressId}`,
      });
      return true;
    }

    // Two segments: :id/default
    if (parts.length === 2 && parts[0] && parts[1] === 'default') {
      const addressId = decodeURIComponent(parts[0]);
      if (method === 'PATCH') {
        await addressController.setDefaultAddress(req, res, addressId);
        return true;
      }
      sendJson(res, 405, {
        success: false,
        error: `Method ${method} Not Allowed on /api/customer/addresses/${addressId}/default`,
      });
      return true;
    }
  }

  // Not an address route
  return false;
};

