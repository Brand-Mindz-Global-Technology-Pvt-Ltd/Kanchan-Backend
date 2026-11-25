import type { IncomingMessage, ServerResponse } from 'node:http';
import * as productService from '../services/product.service.ts';
import type { CreateProductInput, UpdateProductInput } from '../types/product.types.ts';
import { sendJson, parseJsonBody } from '../middleware/http.middleware.ts';

export const getAll = async (
  _req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<void> => {
  try {
    const category = url.searchParams.get('category') ?? undefined;
    const products = await productService.getAllProducts(category);
    sendJson(res, 200, {
      success: true,
      count: products.length,
      data: products,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendJson(res, 500, { success: false, error: message });
  }
};

export const getById = async (
  _req: IncomingMessage,
  res: ServerResponse,
  id: string
): Promise<void> => {
  try {
    const product = await productService.getProductById(id);
    if (!product) {
      sendJson(res, 404, {
        success: false,
        error: `Product with ID '${id}' not found`,
      });
      return;
    }
    sendJson(res, 200, {
      success: true,
      data: product,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendJson(res, 500, { success: false, error: message });
  }
};

export const create = async (
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> => {
  try {
    const body = await parseJsonBody<CreateProductInput>(req);
    if (!body || typeof body !== 'object') {
      sendJson(res, 400, {
        success: false,
        error: 'Invalid or empty JSON request body',
      });
      return;
    }

    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'name' is required and must be a non-empty string",
      });
      return;
    }

    if (!body.price || typeof body.price !== 'string' || !body.price.trim()) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'price' is required and must be a valid price string (e.g., '₹899' or '899')",
      });
      return;
    }

    if (!body.category || typeof body.category !== 'string' || !body.category.trim()) {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'category' is required and must be a valid category name",
      });
      return;
    }

    const newProduct = await productService.createProduct(body);
    sendJson(res, 201, {
      success: true,
      message: 'Product created successfully',
      data: newProduct,
    });
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string };
    if (err?.message && err.message.startsWith('CATEGORY_NOT_FOUND')) {
      sendJson(res, 400, {
        success: false,
        error: `Validation failed: ${err.message.replace('CATEGORY_NOT_FOUND: ', '')}`,
      });
      return;
    }
    const message = err?.message || 'Invalid JSON format';
    sendJson(res, 400, { success: false, error: message });
  }
};

export const update = async (
  req: IncomingMessage,
  res: ServerResponse,
  id: string
): Promise<void> => {
  try {
    const body = await parseJsonBody<UpdateProductInput>(req);
    if (!body || typeof body !== 'object') {
      sendJson(res, 400, {
        success: false,
        error: 'Invalid or empty JSON request body',
      });
      return;
    }

    const updated = await productService.updateProduct(id, body);
    if (!updated) {
      sendJson(res, 404, {
        success: false,
        error: `Product with ID '${id}' not found`,
      });
      return;
    }

    sendJson(res, 200, {
      success: true,
      message: 'Product updated successfully',
      data: updated,
    });
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string };
    if (err?.message && err.message.startsWith('CATEGORY_NOT_FOUND')) {
      sendJson(res, 400, {
        success: false,
        error: `Validation failed: ${err.message.replace('CATEGORY_NOT_FOUND: ', '')}`,
      });
      return;
    }
    const message = err?.message || 'Invalid JSON format';
    sendJson(res, 400, { success: false, error: message });
  }
};

export const remove = async (
  _req: IncomingMessage,
  res: ServerResponse,
  id: string
): Promise<void> => {
  try {
    const deleted = await productService.deleteProduct(id);
    if (!deleted) {
      sendJson(res, 404, {
        success: false,
        error: `Product with ID '${id}' not found`,
      });
      return;
    }

    sendJson(res, 200, {
      success: true,
      message: `Product with ID '${id}' deleted successfully`,
    });
  } catch (error: unknown) {
    const err = error as { code?: string; errno?: number; message?: string };
    if (err?.code === 'ER_ROW_IS_REFERENCED_2' || err?.errno === 1451) {
      sendJson(res, 400, {
        success: false,
        error: `Cannot delete product with ID '${id}' because it is associated with existing orders`,
      });
      return;
    }
    const message = err?.message || 'Unknown error';
    sendJson(res, 500, { success: false, error: message });
  }
};
