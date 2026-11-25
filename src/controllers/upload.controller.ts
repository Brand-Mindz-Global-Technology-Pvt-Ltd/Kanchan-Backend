import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { sendJson, setCorsHeaders } from '../middleware/http.middleware.ts';
import { authenticateAdminRequest } from './admin.controller.ts';

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB (5,242,880 bytes)

export interface DetectedImageType {
  ext: 'jpg' | 'png' | 'webp';
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
}

/**
 * Validates actual binary file signatures (magic bytes):
 * - JPEG: FF D8 FF
 * - PNG:  89 50 4E 47 0D 0A 1A 0A
 * - WebP: RIFF (bytes 0-3) and WEBP (bytes 8-11)
 */
export function detectImageSignature(buffer: Buffer): DetectedImageType | null {
  if (!buffer || buffer.length < 12) {
    return null;
  }

  // 1. Check JPEG (FF D8 FF)
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }

  // 2. Check PNG (89 50 4E 47 0D 0A 1A 0A)
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { ext: 'png', mime: 'image/png' };
  }

  // 3. Check WebP (RIFF .... WEBP)
  if (
    buffer[0] === 0x52 && // 'R'
    buffer[1] === 0x49 && // 'I'
    buffer[2] === 0x46 && // 'F'
    buffer[3] === 0x46 && // 'F'
    buffer[8] === 0x57 && // 'W'
    buffer[9] === 0x45 && // 'E'
    buffer[10] === 0x42 && // 'B'
    buffer[11] === 0x50 // 'P'
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }

  return null;
}

/**
 * Core image upload processor supporting categories and products.
 */
async function handleImageUpload(
  req: IncomingMessage,
  res: ServerResponse,
  subfolder: 'categories' | 'products',
  prefix: string
): Promise<void> {
  // 1. Authenticate admin user
  const admin = authenticateAdminRequest(req, res);
  if (!admin) {
    // 401 response already sent by authenticateAdminRequest
    return;
  }

  // 2. Validate Content-Type header if provided
  const contentTypeHeader = req.headers['content-type'];
  const rawMime = contentTypeHeader ? contentTypeHeader.split(';')[0]?.trim().toLowerCase() : undefined;

  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/octet-stream'];
  if (rawMime && !allowedMimes.includes(rawMime)) {
    sendJson(res, 415, {
      success: false,
      error: `Unsupported Media Type: Only JPEG, PNG, and WebP images are allowed. Received '${rawMime}'`,
    });
    return;
  }

  // 3. Fast upfront check for Content-Length
  const contentLengthHeader = req.headers['content-length'];
  if (contentLengthHeader !== undefined) {
    const contentLength = Number(contentLengthHeader);
    if (!Number.isNaN(contentLength)) {
      if (contentLength === 0) {
        sendJson(res, 400, {
          success: false,
          error: 'Empty file: uploaded file contains no data',
        });
        return;
      }
      if (contentLength > MAX_FILE_SIZE) {
        sendJson(res, 413, {
          success: false,
          error: `Payload Too Large: File size exceeds the 5MB limit (${contentLength} bytes received)`,
        });
        return;
      }
    }
  }

  // 4. Bounded raw binary accumulation
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let isOversized = false;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > MAX_FILE_SIZE) {
      isOversized = true;
      break;
    }
    chunks.push(buf);
  }

  if (isOversized) {
    sendJson(res, 413, {
      success: false,
      error: 'Payload Too Large: File size exceeds the 5MB limit (maximum 5,242,880 bytes)',
    });
    return;
  }

  const fileBuffer = Buffer.concat(chunks);
  if (fileBuffer.length === 0) {
    sendJson(res, 400, {
      success: false,
      error: 'Empty file: uploaded file contains no data',
    });
    return;
  }

  // 5. Verify actual binary signature (magic bytes)
  const detected = detectImageSignature(fileBuffer);
  if (!detected) {
    sendJson(res, 400, {
      success: false,
      error: 'Invalid file signature: File contents do not match allowed image formats (JPEG, PNG, WebP)',
    });
    return;
  }

  // If MIME type was explicitly provided, verify it does not contradict the detected signature
  if (rawMime && rawMime !== 'application/octet-stream') {
    const isJpegMatch = (rawMime === 'image/jpeg' || rawMime === 'image/jpg') && detected.mime === 'image/jpeg';
    if (rawMime !== detected.mime && !isJpegMatch) {
      sendJson(res, 400, {
        success: false,
        error: `MIME type mismatch: Header '${rawMime}' does not match detected file signature '${detected.mime}'`,
      });
      return;
    }
  }

  // 6. Safe filesystem storage in uploads/<subfolder>/
  const uploadDir = path.resolve(process.cwd(), 'uploads', subfolder);
  await fs.promises.mkdir(uploadDir, { recursive: true });

  const randomSuffix = crypto.randomBytes(16).toString('hex');
  const filename = `${prefix}-${Date.now()}-${randomSuffix}.${detected.ext}`;
  const targetPath = path.resolve(uploadDir, filename);

  // Defense-in-depth: Prevent any directory traversal
  if (!targetPath.startsWith(uploadDir) || path.dirname(targetPath) !== uploadDir) {
    sendJson(res, 403, {
      success: false,
      error: 'Forbidden: Invalid file path',
    });
    return;
  }

  // Write file safely with 'wx' to prevent overwriting
  await fs.promises.writeFile(targetPath, fileBuffer, { flag: 'wx' });

  // 7. Successful response
  sendJson(res, 201, {
    success: true,
    data: {
      imageUrl: `/uploads/${subfolder}/${filename}`,
    },
  });
}

/**
 * Core static image server supporting categories and products.
 */
async function handleServeImage(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  subfolder: 'categories' | 'products'
): Promise<void> {
  const method = req.method?.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    sendJson(res, 405, {
      success: false,
      error: `Method ${method} Not Allowed on ${pathname}`,
    });
    return;
  }

  const prefix = `/uploads/${subfolder}/`;
  if (!pathname.startsWith(prefix)) {
    sendJson(res, 404, { success: false, error: 'File not found' });
    return;
  }

  const requestedFilename = pathname.slice(prefix.length);
  if (!requestedFilename || requestedFilename.trim() === '') {
    sendJson(res, 404, { success: false, error: 'File not found' });
    return;
  }

  const decodedFilename = decodeURIComponent(requestedFilename);

  // Path traversal prevention: strictly reject separators or directory stepping
  if (
    decodedFilename.includes('/') ||
    decodedFilename.includes('\\') ||
    decodedFilename.includes('..') ||
    decodedFilename.includes('\0')
  ) {
    sendJson(res, 403, { success: false, error: 'Access denied: Invalid filename' });
    return;
  }

  const uploadDir = path.resolve(process.cwd(), 'uploads', subfolder);
  const safePath = path.resolve(uploadDir, path.basename(decodedFilename));

  if (!safePath.startsWith(uploadDir) || path.dirname(safePath) !== uploadDir) {
    sendJson(res, 403, { success: false, error: 'Access denied' });
    return;
  }

  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(safePath);
  } catch (err: unknown) {
    const error = err as { code?: string };
    if (error?.code === 'ENOENT') {
      sendJson(res, 404, { success: false, error: 'File not found' });
      return;
    }
    sendJson(res, 500, { success: false, error: 'Error accessing file' });
    return;
  }

  if (!stat.isFile()) {
    sendJson(res, 404, { success: false, error: 'File not found' });
    return;
  }

  const ext = path.extname(safePath).toLowerCase();
  let mimeType: string;
  if (ext === '.jpg' || ext === '.jpeg') {
    mimeType = 'image/jpeg';
  } else if (ext === '.png') {
    mimeType = 'image/png';
  } else if (ext === '.webp') {
    mimeType = 'image/webp';
  } else {
    sendJson(res, 403, { success: false, error: 'Forbidden file format' });
    return;
  }

  setCorsHeaders(res);
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (method === 'HEAD') {
    res.writeHead(200);
    res.end();
    return;
  }

  res.writeHead(200);
  const readStream = fs.createReadStream(safePath);
  readStream.on('error', () => {
    if (!res.headersSent && !res.writableEnded) {
      sendJson(res, 500, { success: false, error: 'Error streaming file' });
    }
  });
  readStream.pipe(res);
}

// -----------------------------------------------------------------------------
// Category image upload and static serving exports
// -----------------------------------------------------------------------------
export const uploadCategoryImage = async (
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> => {
  return handleImageUpload(req, res, 'categories', 'cat');
};

export const serveCategoryImage = async (
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<void> => {
  return handleServeImage(req, res, pathname, 'categories');
};

// -----------------------------------------------------------------------------
// Product image upload and static serving exports
// -----------------------------------------------------------------------------
export const uploadProductImage = async (
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> => {
  return handleImageUpload(req, res, 'products', 'prod');
};

export const serveProductImage = async (
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<void> => {
  return handleServeImage(req, res, pathname, 'products');
};
