import type { IncomingMessage, ServerResponse } from 'node:http';

export const MAX_BODY_SIZE = 1024 * 1024; // 1 MB = 1,048,576 bytes

export class PayloadTooLargeError extends Error {
  readonly statusCode: number = 413;
  constructor(message = 'Payload Too Large: Request body exceeds the 1MB limit') {
    super(message);
    this.name = 'PayloadTooLargeError';
  }
}

export const setCorsHeaders = (res: ServerResponse): void => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

export const sendJson = (res: ServerResponse, statusCode: number, data: unknown): void => {
  if (res.headersSent || res.writableEnded) {
    return;
  }
  setCorsHeaders(res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
};

export const parseJsonBody = async <T = unknown>(
  req: IncomingMessage,
  res?: ServerResponse
): Promise<T | null> => {
  return new Promise((resolve, reject) => {
    const response = res || (req as unknown as { res?: ServerResponse }).res;
    let bytesReceived = 0;
    let isOversized = false;
    let body = '';

    // Fast-path: Check Content-Length header upfront if present
    const contentLengthHeader = req.headers['content-length'];
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (!Number.isNaN(contentLength) && contentLength > MAX_BODY_SIZE) {
        isOversized = true;
        const error = new PayloadTooLargeError(
          `Payload Too Large: Request body size (${contentLength} bytes) exceeds the 1MB limit`
        );

        // Safely discard incoming stream chunks without accumulating into memory
        req.on('data', () => {});
        req.resume();

        if (response && !response.headersSent && !response.writableEnded) {
          sendJson(response, 413, {
            success: false,
            error: error.message,
            message: error.message,
          });
        }

        reject(error);
        return;
      }
    }

    req.on('data', (chunk: Buffer) => {
      if (isOversized) return;

      bytesReceived += chunk.length;
      if (bytesReceived > MAX_BODY_SIZE) {
        isOversized = true;
        body = ''; // Free accumulated memory immediately

        // Stop accumulating and discard remaining incoming stream chunks
        req.removeAllListeners('data');
        req.on('data', () => {});
        req.resume();

        const error = new PayloadTooLargeError(
          `Payload Too Large: Request body exceeds the 1MB limit (${bytesReceived} bytes received)`
        );

        if (response && !response.headersSent && !response.writableEnded) {
          sendJson(response, 413, {
            success: false,
            error: error.message,
            message: error.message,
          });
        }

        reject(error);
        return;
      }

      body += chunk.toString();
    });

    req.on('end', () => {
      if (isOversized) return;

      if (!body.trim()) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(body) as T);
      } catch {
        reject(new Error('Invalid JSON format'));
      }
    });

    req.on('error', (err: Error) => {
      if (isOversized) return;
      reject(err);
    });
  });
};

