import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { setCorsHeaders, sendJson, parseJsonBody, PayloadTooLargeError } from './middleware/http.middleware.ts';
import { handleProductRoutes } from './routes/product.routes.ts';
import { handleCategoryRoutes } from './routes/category.routes.ts';
import { handleCartRoutes } from './routes/cart.routes.ts';
import { handleWishlistRoutes } from './routes/wishlist.routes.ts';
import { handleCustomerRoutes } from './routes/customer.routes.ts';
import { handleAdminRoutes } from './routes/admin.routes.ts';
import { handleEnquiryRoutes } from './routes/enquiry.routes.ts';
import { handleAddressRoutes } from './routes/address.routes.ts';
import { handleOrderRoutes } from './routes/order.routes.ts';
import { handleUploadRoutes } from './routes/upload.routes.ts';
import { testDbConnection } from './config/db.ts';

try {
  process.loadEnvFile();
} catch {
  // .env file is optional if environment variables are already set
}

const PORT = Number(process.env.PORT) || 5000;

export { setCorsHeaders, sendJson, parseJsonBody, PayloadTooLargeError };

const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Link response to request for downstream middleware helpers
  (req as unknown as { res: ServerResponse }).res = res;

  // Centralized URL parsing and trailing-slash normalization
  let rawUrl = req.url || '/';
  if (rawUrl.startsWith('//')) {
    rawUrl = '/' + rawUrl.replace(/^\/+/, '');
  }
  const url = new URL(rawUrl, `http://${req.headers.host || 'localhost'}`);

  // Normalize trailing slashes (e.g. '/api/products/' -> '/api/products')
  // while preserving the root route '/', query parameters, and URL-encoded segments.
  if (url.pathname !== '/') {
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  }

  try {
    // Health check endpoint
    if (url.pathname === '/health' && req.method === 'GET') {
      sendJson(res, 200, { status: 'ok', message: 'Kanchan Backend is running' });
      return;
    }

    // Handle upload and static file serving routes (/api/admin/uploads/categories, /uploads/categories/...)
    if (await handleUploadRoutes(req, res, url)) {
      return;
    }

    // Handle admin auth routes (/api/admin/auth/login, /api/admin/auth/logout, etc.)
    if (await handleAdminRoutes(req, res, url)) {
      return;
    }

    // Handle enquiry routes (/api/enquiries, /api/admin/enquiries, etc.)
    if (await handleEnquiryRoutes(req, res, url)) {
      return;
    }

    // Handle auth / customer routes (/api/auth/register, /api/auth/login, etc.)
    if (await handleCustomerRoutes(req, res, url)) {
      return;
    }

    // Handle customer address routes (/api/customer/addresses, /api/customer/addresses/:id, etc.)
    if (await handleAddressRoutes(req, res, url)) {
      return;
    }

    // Handle product routes (/api/products, /api/products/:id)
    if (await handleProductRoutes(req, res, url)) {
      return;
    }

    // Handle category routes (/api/categories, /api/categories/:id)
    if (await handleCategoryRoutes(req, res, url)) {
      return;
    }

    // Handle cart routes (/api/cart, /api/cart/:customerId, etc.)
    if (await handleCartRoutes(req, res, url)) {
      return;
    }

    // Handle wishlist routes (/api/wishlist, /api/wishlist/:customerId, etc.)
    if (await handleWishlistRoutes(req, res, url)) {
      return;
    }

    // Handle order routes (/api/orders, /api/orders/:id, /api/orders/:id/cancel)
    if (await handleOrderRoutes(req, res, url)) {
      return;
    }

    // Fallback 404 for unknown endpoints
    sendJson(res, 404, { success: false, error: 'Endpoint Not Found' });
  } catch (error) {
    if (!res.headersSent && !res.writableEnded) {
      if (
        error instanceof PayloadTooLargeError ||
        (error instanceof Error && error.message.includes('Payload Too Large'))
      ) {
        sendJson(res, 413, {
          success: false,
          error: 'Payload Too Large: Request body exceeds the 1MB limit',
          message: 'Payload Too Large: Request body exceeds the 1MB limit',
        });
      } else {
        sendJson(res, 500, { success: false, error: 'Internal Server Error' });
      }
    }
  }
});

server.on('listening', async () => {
  const address = server.address();
  const activePort = typeof address === 'object' && address ? address.port : PORT;
  console.log(`Server is running on port ${activePort}`);
  await testDbConnection();
});

let currentPort = PORT;
const MAX_PORT_RETRIES = 5;
let retryCount = 0;

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE' && retryCount < MAX_PORT_RETRIES) {
    retryCount++;
    currentPort++;
    console.warn(`Port ${currentPort - 1} is in use, trying fallback port ${currentPort}...`);
    server.listen(currentPort);
  } else {
    console.error('Server error:', err);
  }
});

server.listen(PORT);

export default server;
