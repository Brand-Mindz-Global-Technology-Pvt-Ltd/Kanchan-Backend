import type { IncomingMessage, ServerResponse } from 'node:http';
import * as enquiryController from '../controllers/enquiry.controller.ts';
import { sendJson } from '../middleware/http.middleware.ts';

export const handleEnquiryRoutes = async (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> => {
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method?.toUpperCase();

  // 1. POST /api/enquiries (Customer enquiry submission)
  if (pathname === '/api/enquiries') {
    if (method === 'POST') {
      await enquiryController.submitEnquiry(req, res);
      return true;
    }
    sendJson(res, 405, { success: false, error: `Method ${method} Not Allowed on /api/enquiries` });
    return true;
  }

  // 2. GET /api/admin/enquiries (Admin enquiries listing)
  if (pathname === '/api/admin/enquiries') {
    if (method === 'GET') {
      await enquiryController.getAdminEnquiries(req, res, url);
      return true;
    }
    sendJson(res, 405, { success: false, error: `Method ${method} Not Allowed on /api/admin/enquiries` });
    return true;
  }

  // 3. PATCH /api/admin/enquiries/:id/status (Admin enquiry status update)
  const statusMatch = pathname.match(/^\/api\/admin\/enquiries\/([^/]+)\/status$/);
  if (statusMatch) {
    if (method === 'PATCH') {
      const id = decodeURIComponent(statusMatch[1]!);
      await enquiryController.updateAdminEnquiryStatus(req, res, id);
      return true;
    }
    sendJson(res, 405, { success: false, error: `Method ${method} Not Allowed on ${pathname}` });
    return true;
  }

  // 4. DELETE /api/admin/enquiries/:id (Admin enquiry delete)
  const deleteMatch = pathname.match(/^\/api\/admin\/enquiries\/([^/]+)$/);
  if (deleteMatch) {
    if (method === 'DELETE') {
      const id = decodeURIComponent(deleteMatch[1]!);
      await enquiryController.deleteAdminEnquiry(req, res, id);
      return true;
    }
    sendJson(res, 405, { success: false, error: `Method ${method} Not Allowed on ${pathname}` });
    return true;
  }

  // Not an enquiry route
  return false;
};

