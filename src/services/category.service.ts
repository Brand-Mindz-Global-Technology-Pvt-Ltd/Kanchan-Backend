import crypto from 'node:crypto';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { pool } from '../config/db.ts';
import type { Category, CategoryStatus, CreateCategoryInput, UpdateCategoryInput } from '../types/category.types.ts';

interface CategoryRow extends RowDataPacket {
  id: string;
  name: string;
  description: string;
  image: string;
  product_count: number;
  status: CategoryStatus;
  created_at?: Date;
  updated_at?: Date;
}

function mapRowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    image: row.image,
    productCount: Number(row.product_count) || 0,
    status: row.status,
  };
}

// Initial mock categories matching verified Kanchan Frontend data
const INITIAL_CATEGORIES: Category[] = [
  {
    id: 'cat-1',
    name: 'Tropical',
    description: 'Exotic tropical plants for indoor spaces',
    image: '/src/assets/categories/img-1.png',
    productCount: 25,
    status: 'Active',
  },
  {
    id: 'cat-2',
    name: 'Low Light',
    description: 'Plants that thrive in low light conditions',
    image: '/src/assets/categories/img-2.png',
    productCount: 18,
    status: 'Active',
  },
  {
    id: 'cat-3',
    name: 'Air Purifying',
    description: 'Plants known for their air cleaning properties',
    image: '/src/assets/categories/img-3.png',
    productCount: 22,
    status: 'Active',
  },
  {
    id: 'cat-4',
    name: 'Flowering',
    description: 'Beautiful flowering plants for your home',
    image: '/src/assets/categories/img-4.png',
    productCount: 15,
    status: 'Active',
  },
  {
    id: 'cat-5',
    name: 'Succulents',
    description: 'Low-maintenance succulent plants',
    image: '/src/assets/categories/img-5.png',
    productCount: 30,
    status: 'Active',
  },
  {
    id: 'cat-6',
    name: 'Outdoor',
    description: 'Plants perfect for outdoor gardens',
    image: '/src/assets/categories/img-6.png',
    productCount: 20,
    status: 'Active',
  },
];

let isSeeded = false;

/**
 * Ensures initial verified categories are seeded into MySQL when the categories table is empty.
 * Preserves initial category IDs (cat-1 to cat-6) and default catalogue records.
 */
export async function ensureInitialCategoriesSeeded(): Promise<void> {
  if (isSeeded) return;

  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM categories');
    const count = Number(rows[0]?.['count']) || 0;

    if (count === 0) {
      for (const cat of INITIAL_CATEGORIES) {
        await pool.query(
          `INSERT INTO categories (id, name, description, image, product_count, status)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE id=id`,
          [cat.id, cat.name, cat.description, cat.image, cat.productCount, cat.status || 'Active']
        );
      }
    }
    isSeeded = true;
  } catch (error) {
    console.warn('[CategoryService] Could not check/seed categories in MySQL:', error instanceof Error ? error.message : error);
  }
}

export const getAllCategories = async (filters?: {
  status?: string | undefined;
  search?: string | undefined;
}): Promise<Category[]> => {
  await ensureInitialCategoriesSeeded();

  let query = 'SELECT id, name, description, image, product_count, status FROM categories';
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters?.status && filters.status.trim().toLowerCase() !== 'all') {
    conditions.push('LOWER(status) = LOWER(?)');
    params.push(filters.status.trim());
  }

  if (filters?.search && filters.search.trim()) {
    conditions.push('(LOWER(name) LIKE ? OR LOWER(description) LIKE ?)');
    const term = `%${filters.search.trim().toLowerCase()}%`;
    params.push(term, term);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at ASC, id ASC';

  const [rows] = await pool.query<CategoryRow[]>(query, params);
  return rows.map(mapRowToCategory);
};

export const getCategoryById = async (id: string): Promise<Category | undefined> => {
  await ensureInitialCategoriesSeeded();

  const [rows] = await pool.query<CategoryRow[]>(
    'SELECT id, name, description, image, product_count, status FROM categories WHERE id = ? LIMIT 1',
    [id]
  );

  const row = rows[0];
  return row ? mapRowToCategory(row) : undefined;
};

export const getCategoryByName = async (
  name: string,
  excludeId?: string
): Promise<Category | undefined> => {
  await ensureInitialCategoriesSeeded();

  let query = 'SELECT id, name, description, image, product_count, status FROM categories WHERE LOWER(name) = LOWER(?)';
  const params: (string | number)[] = [name.trim()];

  if (excludeId) {
    query += ' AND id != ?';
    params.push(excludeId);
  }

  query += ' LIMIT 1';

  const [rows] = await pool.query<CategoryRow[]>(query, params);
  const row = rows[0];
  return row ? mapRowToCategory(row) : undefined;
};

export const createCategory = async (input: CreateCategoryInput): Promise<Category> => {
  await ensureInitialCategoriesSeeded();

  const trimmedName = input.name.trim();
  const id = `cat-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const fallbackImage = '/src/assets/categories/img-1.png';

  const newCategory: Category = {
    id,
    name: trimmedName,
    description: input.description?.trim() || '',
    image: input.image?.trim() || fallbackImage,
    productCount: input.productCount ?? 0,
    status: input.status || 'Active',
  };

  await pool.query<ResultSetHeader>(
    `INSERT INTO categories (id, name, description, image, product_count, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      newCategory.id,
      newCategory.name,
      newCategory.description,
      newCategory.image,
      newCategory.productCount,
      newCategory.status,
    ]
  );

  return newCategory;
};

export const updateCategory = async (
  id: string,
  input: UpdateCategoryInput
): Promise<Category | null> => {
  await ensureInitialCategoriesSeeded();

  const existing = await getCategoryById(id);
  if (!existing) {
    return null;
  }

  const updatedName = input.name !== undefined ? input.name.trim() : existing.name;
  const updatedDesc = input.description !== undefined ? input.description.trim() : existing.description;
  const updatedImage = input.image !== undefined ? input.image.trim() : existing.image;
  const updatedProductCount = input.productCount !== undefined ? input.productCount : existing.productCount;
  const updatedStatus = input.status !== undefined ? input.status : (existing.status || 'Active');

  await pool.query<ResultSetHeader>(
    `UPDATE categories
     SET name = ?, description = ?, image = ?, product_count = ?, status = ?
     WHERE id = ?`,
    [updatedName, updatedDesc, updatedImage, updatedProductCount, updatedStatus, id]
  );

  return {
    id,
    name: updatedName,
    description: updatedDesc,
    image: updatedImage,
    productCount: updatedProductCount,
    status: updatedStatus,
  };
};

export const deleteCategory = async (id: string): Promise<boolean> => {
  await ensureInitialCategoriesSeeded();

  const [result] = await pool.query<ResultSetHeader>(
    'DELETE FROM categories WHERE id = ?',
    [id]
  );

  return (result.affectedRows ?? 0) > 0;
};
