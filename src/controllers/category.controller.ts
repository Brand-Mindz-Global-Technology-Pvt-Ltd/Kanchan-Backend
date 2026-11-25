import type { IncomingMessage, ServerResponse } from 'node:http';
import * as categoryService from '../services/category.service.ts';
import type { CreateCategoryInput, UpdateCategoryInput } from '../types/category.types.ts';
import { sendJson, parseJsonBody } from '../middleware/http.middleware.ts';

export const getAll = async (
  _req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<void> => {
  try {
    const status = url.searchParams.get('status') ?? undefined;
    const search = url.searchParams.get('search') ?? undefined;
    const categories = await categoryService.getAllCategories({ status, search });

    sendJson(res, 200, {
      success: true,
      count: categories.length,
      data: categories,
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
    const category = await categoryService.getCategoryById(id);
    if (!category) {
      sendJson(res, 404, {
        success: false,
        error: `Category with ID '${id}' not found`,
      });
      return;
    }

    sendJson(res, 200, {
      success: true,
      data: category,
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
    const body = await parseJsonBody<CreateCategoryInput>(req);
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

    const trimmedName = body.name.trim();
    const existing = await categoryService.getCategoryByName(trimmedName);
    if (existing) {
      sendJson(res, 400, {
        success: false,
        error: `Validation failed: A category with name '${trimmedName}' already exists`,
      });
      return;
    }

    if (body.status !== undefined && body.status !== 'Active' && body.status !== 'Inactive') {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'status' must be either 'Active' or 'Inactive'",
      });
      return;
    }

    const newCategory = await categoryService.createCategory(body);
    sendJson(res, 201, {
      success: true,
      message: 'Category created successfully',
      data: newCategory,
    });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code === 'ER_DUP_ENTRY') {
      sendJson(res, 400, {
        success: false,
        error: 'Validation failed: A category with this name already exists',
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
    const body = await parseJsonBody<UpdateCategoryInput>(req);
    if (!body || typeof body !== 'object') {
      sendJson(res, 400, {
        success: false,
        error: 'Invalid or empty JSON request body',
      });
      return;
    }

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        sendJson(res, 400, {
          success: false,
          error: "Validation failed: 'name' must be a non-empty string",
        });
        return;
      }

      const duplicate = await categoryService.getCategoryByName(body.name, id);
      if (duplicate) {
        sendJson(res, 400, {
          success: false,
          error: `Validation failed: A category with name '${body.name.trim()}' already exists`,
        });
        return;
      }
    }

    if (body.status !== undefined && body.status !== 'Active' && body.status !== 'Inactive') {
      sendJson(res, 400, {
        success: false,
        error: "Validation failed: 'status' must be either 'Active' or 'Inactive'",
      });
      return;
    }

    const updated = await categoryService.updateCategory(id, body);
    if (!updated) {
      sendJson(res, 404, {
        success: false,
        error: `Category with ID '${id}' not found`,
      });
      return;
    }

    sendJson(res, 200, {
      success: true,
      message: 'Category updated successfully',
      data: updated,
    });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code === 'ER_DUP_ENTRY') {
      sendJson(res, 400, {
        success: false,
        error: 'Validation failed: A category with this name already exists',
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
    const deleted = await categoryService.deleteCategory(id);
    if (!deleted) {
      sendJson(res, 404, {
        success: false,
        error: `Category with ID '${id}' not found`,
      });
      return;
    }

    sendJson(res, 200, {
      success: true,
      message: `Category with ID '${id}' deleted successfully`,
    });
  } catch (error: unknown) {
    const err = error as { code?: string; errno?: number; message?: string };
    if (err?.code === 'ER_ROW_IS_REFERENCED_2' || err?.errno === 1451) {
      sendJson(res, 400, {
        success: false,
        error: `Cannot delete category with ID '${id}' because it contains associated products`,
      });
      return;
    }
    const message = err?.message || 'Unknown error';
    sendJson(res, 500, { success: false, error: message });
  }
};
