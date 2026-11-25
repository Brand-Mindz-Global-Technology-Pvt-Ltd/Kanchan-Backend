import type { IncomingMessage, ServerResponse } from 'node:http';
import * as enquiryService from '../services/enquiry.service.ts';
import { authenticateAdminRequest } from './admin.controller.ts';
import type {
  CreateEnquiryInput,
  UpdateEnquiryStatusInput,
} from '../types/enquiry.types.ts';
import {
  ENQUIRY_STATUSES,
  normalizeEnquiryStatus,
} from '../types/enquiry.types.ts';
import { sendJson, parseJsonBody } from '../middleware/http.middleware.ts';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const submitEnquiry = async (
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> => {
  try {
    const body = await parseJsonBody<CreateEnquiryInput>(req);
    if (!body || typeof body !== 'object') {
      sendJson(res, 400, {
        success: false,
        error: 'Invalid or empty JSON request body',
      });
      return;
    }

    // 1. Validate customer name
    const rawName = body.customerName ?? body.fullName ?? body.name;
    if (typeof rawName !== 'string' || !rawName.trim()) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'customerName' (or 'fullName') is required and must be a non-empty string",
      });
      return;
    }
    const customerName = rawName.trim();
    if (customerName.length < 2) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'customerName' must be at least 2 characters",
      });
      return;
    }
    if (customerName.length > 150) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'customerName' exceeds maximum length of 150 characters",
      });
      return;
    }

    // 2. Validate email
    if (typeof body.email !== 'string' || !body.email.trim()) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'email' is required",
      });
      return;
    }
    const email = body.email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'email' must be a valid email format",
      });
      return;
    }
    if (email.length > 191) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'email' exceeds maximum length of 191 characters",
      });
      return;
    }

    // 3. Validate phone
    if (typeof body.phone !== 'string' || !body.phone.trim()) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'phone' is required and must be a valid contact number",
      });
      return;
    }
    const phone = body.phone.trim();
    const digitsOnly = phone.replace(/\D/g, '');
    if (digitsOnly.length < 10 || digitsOnly.length > 15) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'phone' must contain between 10 and 15 digits",
      });
      return;
    }
    if (phone.length > 20) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'phone' exceeds maximum length of 20 characters",
      });
      return;
    }

    // 4. Validate message
    if (typeof body.message !== 'string' || !body.message.trim()) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'message' is required",
      });
      return;
    }
    const message = body.message.trim();
    if (message.length < 5) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'message' must be at least 5 characters",
      });
      return;
    }
    if (message.length > 5000) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'message' exceeds maximum length of 5000 characters",
      });
      return;
    }

    // 5. Optional fields
    let subject = 'General Enquiry';
    if (typeof body.subject === 'string' && body.subject.trim()) {
      subject = body.subject.trim();
      if (subject.length > 255) {
        sendJson(res, 400, {
          success: false,
          error: "Validation failed: 'subject' exceeds maximum length of 255 characters",
        });
        return;
      }
    }

    const city = typeof body.city === 'string' && body.city.trim() ? body.city.trim() : undefined;
    if (city && city.length > 100) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'city' exceeds maximum length of 100 characters",
      });
      return;
    }

    const state = typeof body.state === 'string' && body.state.trim() ? body.state.trim() : undefined;
    if (state && state.length > 100) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'state' exceeds maximum length of 100 characters",
      });
      return;
    }

    const enquiry = await enquiryService.createEnquiry({
      customerName,
      email,
      phone,
      subject,
      message,
      city,
      state,
    });

    sendJson(res, 201, {
      success: true,
      message: 'Enquiry submitted successfully',
      data: enquiry,
    });
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    sendJson(res, 400, { success: false, error: errMessage });
  }
};

export const getAdminEnquiries = async (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<void> => {
  try {
    const admin = authenticateAdminRequest(req, res);
    if (!admin) return;

    const statusParam = url.searchParams.get('status') || undefined;
    if (statusParam) {
      const normalized = normalizeEnquiryStatus(statusParam);
      if (!normalized) {
        sendJson(res, 400, {
          success: false,
          error: `Validation failed: Invalid status '${statusParam}'. Valid statuses are: ${ENQUIRY_STATUSES.join(', ')}`,
        });
        return;
      }
    }

    const searchParam = url.searchParams.get('search') || undefined;
    const enquiries = await enquiryService.getAllEnquiries({
      status: statusParam,
      search: searchParam,
    });

    sendJson(res, 200, {
      success: true,
      count: enquiries.length,
      data: enquiries,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendJson(res, 500, { success: false, error: message });
  }
};

export const updateAdminEnquiryStatus = async (
  req: IncomingMessage,
  res: ServerResponse,
  enquiryId: string
): Promise<void> => {
  try {
    const admin = authenticateAdminRequest(req, res);
    if (!admin) return;

    if (!enquiryId || !enquiryId.trim()) {
      sendJson(res, 400, { success: false, error: 'Enquiry ID is required' });
      return;
    }

    const body = await parseJsonBody<UpdateEnquiryStatusInput>(req);
    if (!body || typeof body !== 'object') {
      sendJson(res, 400, {
        success: false,
        error: 'Invalid or empty JSON request body',
      });
      return;
    }

    if (!body.status || typeof body.status !== 'string' || !body.status.trim()) {
      sendJson(res, 400, {
        success: false,
        error: `Validation failed: 'status' is required and must be one of: ${ENQUIRY_STATUSES.join(', ')}`,
      });
      return;
    }

    const normalizedStatus = normalizeEnquiryStatus(body.status);
    if (!normalizedStatus) {
      sendJson(res, 400, {
        success: false,
        error: `Validation failed: Invalid status '${body.status}'. Valid statuses are: ${ENQUIRY_STATUSES.join(', ')}`,
      });
      return;
    }

    const updated = await enquiryService.updateEnquiryStatus(enquiryId, normalizedStatus);

    sendJson(res, 200, {
      success: true,
      message: `Enquiry status updated to '${normalizedStatus}' successfully`,
      data: updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.startsWith('ENQUIRY_NOT_FOUND')) {
      sendJson(res, 404, { success: false, error: message });
      return;
    }
    sendJson(res, 400, { success: false, error: message });
  }
};

export const deleteAdminEnquiry = async (
  req: IncomingMessage,
  res: ServerResponse,
  enquiryId: string
): Promise<void> => {
  try {
    const admin = authenticateAdminRequest(req, res);
    if (!admin) return;

    if (!enquiryId || !enquiryId.trim()) {
      sendJson(res, 400, { success: false, error: 'Enquiry ID is required' });
      return;
    }

    await enquiryService.deleteEnquiry(enquiryId);

    sendJson(res, 200, {
      success: true,
      message: `Enquiry '${enquiryId}' deleted successfully`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.startsWith('ENQUIRY_NOT_FOUND')) {
      sendJson(res, 404, { success: false, error: message });
      return;
    }
    sendJson(res, 400, { success: false, error: message });
  }
};
