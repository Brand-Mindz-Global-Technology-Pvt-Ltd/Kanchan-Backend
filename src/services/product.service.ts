import crypto from 'node:crypto';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { pool } from '../config/db.ts';
import type { Product, CreateProductInput, UpdateProductInput } from '../types/product.types.ts';

interface ProductRow extends RowDataPacket {
  id: string;
  name: string;
  subtitle: string;
  badge: string | null;
  badge_bg: string | null;
  original_price: string;
  price: string;
  price_numeric: number | string;
  rating: number | string;
  image: string;
  images: any;
  category: string;
  category_id: string | null;
  light: string;
  stock: number;
  description: string;
  created_at?: Date;
  updated_at?: Date;
}

function mapRowToProduct(row: ProductRow): Product {
  let imagesArr: string[] | undefined = undefined;
  if (row.images) {
    if (Array.isArray(row.images)) {
      imagesArr = row.images;
    } else if (typeof row.images === 'string') {
      try {
        const parsed = JSON.parse(row.images);
        if (Array.isArray(parsed)) imagesArr = parsed;
      } catch {
        imagesArr = undefined;
      }
    }
  }

  return {
    id: row.id,
    name: row.name,
    subtitle: row.subtitle,
    badge: row.badge ?? undefined,
    badgeBg: row.badge_bg ?? undefined,
    originalPrice: row.original_price,
    price: row.price,
    priceNumeric: Number(row.price_numeric) || 0,
    rating: Number(row.rating) || 0,
    image: row.image,
    images: imagesArr,
    category: row.category,
    light: row.light,
    stock: Number(row.stock) || 0,
    description: row.description,
  };
}

// Initial products store matching verified Kanchan Frontend mock data
const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'monstera-1',
    name: 'Monstera Deliciosa',
    subtitle: 'A tropical beauty',
    badge: 'Best Seller',
    badgeBg: '#06452E',
    originalPrice: '₹999',
    price: '₹899',
    priceNumeric: 899,
    rating: 4.8,
    image: '/src/assets/products/img-1.png',
    category: 'Tropical',
    light: 'indirect',
    stock: 45,
    description: 'The Monstera Deliciosa is a stunning tropical plant known for its distinctive split leaves. Perfect for adding a touch of jungle elegance to any indoor space.',
  },
  {
    id: 'snake-plant-1',
    name: 'Snake Plant Zeylanica',
    subtitle: 'Low maintenance',
    badge: 'Low Light',
    badgeBg: '#06452E',
    originalPrice: '₹699',
    price: '₹549',
    priceNumeric: 549,
    rating: 4.8,
    image: '/src/assets/products/img-2.png',
    category: 'Low Light',
    light: 'low',
    stock: 72,
    description: 'Snake Plant is one of the most tolerant and resilient houseplants. It thrives in low light conditions and requires minimal watering.',
  },
  {
    id: 'peace-lily-1',
    name: 'Peace Lily Sensation',
    subtitle: 'Air purifying',
    badge: 'Air Purifying',
    badgeBg: '#06452E',
    originalPrice: '₹849',
    price: '₹699',
    priceNumeric: 699,
    rating: 4.7,
    image: '/src/assets/products/img-3.png',
    category: 'Air Purifying',
    light: 'indirect',
    stock: 38,
    description: "Peace Lily is renowned for its air-purifying qualities and elegant white blooms. It's an excellent choice for bedrooms and living areas.",
  },
  {
    id: 'areca-palm-1',
    name: 'Areca Palm',
    subtitle: 'Tropical elegance',
    badge: 'Popular',
    badgeBg: '#06452E',
    originalPrice: '₹1299',
    price: '₹1099',
    priceNumeric: 1099,
    rating: 4.6,
    image: '/src/assets/products/img-4.png',
    category: 'Tropical',
    light: 'bright',
    stock: 23,
    description: 'Areca Palm brings tropical elegance to any space with its feathery fronds. Excellent for bright indirect light locations.',
  },
  {
    id: 'pothos-1',
    name: 'Golden Pothos',
    subtitle: 'Easy care',
    badge: 'Beginner Friendly',
    badgeBg: '#06452E',
    originalPrice: '₹449',
    price: '₹349',
    priceNumeric: 349,
    rating: 4.9,
    image: '/src/assets/products/img-1.png',
    category: 'Low Light',
    light: 'low',
    stock: 95,
    description: "Golden Pothos is perfect for beginners. It's virtually indestructible and thrives in various light conditions.",
  },
  {
    id: 'ficus-1',
    name: 'Ficus Lyrata',
    subtitle: 'Statement plant',
    badge: 'Premium',
    badgeBg: '#06452E',
    originalPrice: '₹2499',
    price: '₹2199',
    priceNumeric: 2199,
    rating: 4.5,
    image: '/src/assets/products/img-2.png',
    category: 'Tropical',
    light: 'bright',
    stock: 15,
    description: 'Ficus Lyrata, also known as Fiddle Leaf Fig, is a stunning statement plant with large violin-shaped leaves.',
  },
];

// In-memory cache synced with MySQL
const productCache: Map<string, Product> = new Map(INITIAL_PRODUCTS.map((p) => [p.id, p]));

function normalizeCategory(cat: string): string {
  return cat.toLowerCase().replace(/[-\s]+/g, '');
}

function parsePriceNumeric(priceStr: string): number {
  const numericOnly = priceStr.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(numericOnly);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Validates category name against the categories table in MySQL.
 * Returns the matching category row's id and official name.
 */
async function validateAndGetCategory(categoryName: string): Promise<{ id: string; name: string }> {
  const cleanName = categoryName.trim();
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, name FROM categories WHERE LOWER(REPLACE(REPLACE(name, ' ', ''), '-', '')) = LOWER(REPLACE(REPLACE(?, ' ', ''), '-', '')) LIMIT 1",
    [cleanName]
  );
  const row = rows[0];
  if (!row) {
    throw new Error(`CATEGORY_NOT_FOUND: Category '${categoryName}' does not exist in categories table`);
  }
  return { id: String(row['id']), name: String(row['name']) };
}

let isSeeded = false;

/**
 * Ensures initial verified products are seeded into MySQL when the products table is empty.
 * Preserves initial product IDs (monstera-1, snake-plant-1, etc.) and catalog defaults.
 */
export async function ensureInitialProductsSeeded(): Promise<void> {
  if (isSeeded) return;

  try {
    const [countRows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM products');
    const count = Number(countRows[0]?.['count']) || 0;

    if (count === 0) {
      for (const prod of INITIAL_PRODUCTS) {
        let categoryId: string | null = null;
        try {
          const cat = await validateAndGetCategory(prod.category);
          categoryId = cat.id;
        } catch {
          // If category not found, categoryId remains null
        }

        await pool.query<ResultSetHeader>(
          `INSERT INTO products (
            id, name, subtitle, badge, badge_bg,
            original_price, price, price_numeric, rating,
            image, images, category, category_id, light, stock, description
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE id=id`,
          [
            prod.id,
            prod.name,
            prod.subtitle,
            prod.badge ?? null,
            prod.badgeBg ?? '#06452E',
            prod.originalPrice,
            prod.price,
            prod.priceNumeric,
            prod.rating,
            prod.image,
            prod.images ? JSON.stringify(prod.images) : null,
            prod.category,
            categoryId,
            prod.light,
            prod.stock,
            prod.description,
          ]
        );
      }
    }

    // Refresh in-memory cache with all rows from MySQL
    const [allRows] = await pool.query<ProductRow[]>('SELECT * FROM products ORDER BY created_at ASC, id ASC');
    productCache.clear();
    for (const r of allRows) {
      const p = mapRowToProduct(r);
      productCache.set(p.id, p);
    }

    isSeeded = true;
  } catch (error) {
    console.warn('[ProductService] Could not check/seed products in MySQL:', error instanceof Error ? error.message : error);
  }
}

export function getAllProducts(category?: string): Promise<Product[]> & Product[] {
  let cachedList = Array.from(productCache.values());
  if (category && category.trim().toLowerCase() !== 'all') {
    const target = normalizeCategory(category);
    cachedList = cachedList.filter((p) => normalizeCategory(p.category) === target);
  }

  const promise = (async () => {
    await ensureInitialProductsSeeded();
    let query = 'SELECT * FROM products';
    const params: (string | number)[] = [];

    if (category && category.trim().toLowerCase() !== 'all') {
      query += " WHERE LOWER(REPLACE(REPLACE(category, ' ', ''), '-', '')) = LOWER(REPLACE(REPLACE(?, ' ', ''), '-', ''))";
      params.push(category.trim());
    }

    query += ' ORDER BY created_at ASC, id ASC';

    const [rows] = await pool.query<ProductRow[]>(query, params);
    const list = rows.map(mapRowToProduct);

    // Sync cache
    for (const p of list) {
      productCache.set(p.id, p);
    }

    return list;
  })();

  return Object.assign(promise, cachedList) as any;
}

export function getProductById(id: string): (Promise<Product | undefined> & Product) | undefined {
  const cached = productCache.get(id);

  const promise = (async () => {
    await ensureInitialProductsSeeded();
    const [rows] = await pool.query<ProductRow[]>('SELECT * FROM products WHERE id = ? LIMIT 1', [id]);
    const row = rows[0];
    if (!row) {
      productCache.delete(id);
      return undefined;
    }
    const p = mapRowToProduct(row);
    productCache.set(p.id, p);
    return p;
  })();

  if (!cached) {
    return promise as any;
  }

  return Object.assign(promise, cached) as any;
}

export function createProduct(input: CreateProductInput): Promise<Product> & Product {
  const id = `product-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const priceNumeric = input.priceNumeric ?? parsePriceNumeric(input.price);
  const formattedPrice = input.price.startsWith('₹') ? input.price : `₹${input.price}`;
  const originalPrice = input.originalPrice
    ? (input.originalPrice.startsWith('₹') ? input.originalPrice : `₹${input.originalPrice}`)
    : formattedPrice;

  const newProduct: Product = {
    id,
    name: input.name.trim(),
    subtitle: input.subtitle?.trim() || 'Indoor plant',
    badge: input.badge,
    badgeBg: input.badgeBg || '#06452E',
    originalPrice,
    price: formattedPrice,
    priceNumeric,
    rating: input.rating ?? 4.5,
    image: input.image || '/src/assets/products/img-1.png',
    images: input.images,
    category: input.category.trim(),
    light: input.light || 'indirect',
    stock: input.stock ?? 10,
    description: input.description?.trim() || '',
  };

  productCache.set(id, newProduct);

  const promise = (async () => {
    await ensureInitialProductsSeeded();

    const validatedCat = await validateAndGetCategory(input.category);
    newProduct.category = validatedCat.name;

    await pool.query<ResultSetHeader>(
      `INSERT INTO products (
        id, name, subtitle, badge, badge_bg,
        original_price, price, price_numeric, rating,
        image, images, category, category_id, light, stock, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newProduct.id,
        newProduct.name,
        newProduct.subtitle,
        newProduct.badge ?? null,
        newProduct.badgeBg ?? '#06452E',
        newProduct.originalPrice,
        newProduct.price,
        newProduct.priceNumeric,
        newProduct.rating,
        newProduct.image,
        newProduct.images ? JSON.stringify(newProduct.images) : null,
        newProduct.category,
        validatedCat.id,
        newProduct.light,
        newProduct.stock,
        newProduct.description,
      ]
    );

    productCache.set(id, newProduct);
    return newProduct;
  })();

  return Object.assign(promise, newProduct) as any;
}

export function updateProduct(id: string, input: UpdateProductInput): (Promise<Product | null> & Product) | null {
  const current = productCache.get(id);

  let tempUpdated: Product | null = null;
  if (current) {
    const updatedPrice = input.price !== undefined
      ? (input.price.startsWith('₹') ? input.price : `₹${input.price}`)
      : current.price;

    const updatedPriceNumeric = input.priceNumeric !== undefined
      ? input.priceNumeric
      : (input.price !== undefined ? parsePriceNumeric(input.price) : current.priceNumeric);

    tempUpdated = {
      ...current,
      id: current.id,
      name: input.name !== undefined ? input.name.trim() : current.name,
      subtitle: input.subtitle !== undefined ? input.subtitle.trim() : current.subtitle,
      badge: input.badge !== undefined ? input.badge : current.badge,
      badgeBg: input.badgeBg !== undefined ? input.badgeBg : current.badgeBg,
      originalPrice: input.originalPrice !== undefined
        ? (input.originalPrice.startsWith('₹') ? input.originalPrice : `₹${input.originalPrice}`)
        : current.originalPrice,
      price: updatedPrice,
      priceNumeric: updatedPriceNumeric,
      rating: input.rating !== undefined ? input.rating : current.rating,
      image: input.image !== undefined ? input.image : current.image,
      images: input.images !== undefined ? input.images : current.images,
      category: input.category !== undefined ? input.category.trim() : current.category,
      light: input.light !== undefined ? input.light : current.light,
      stock: input.stock !== undefined ? input.stock : current.stock,
      description: input.description !== undefined ? input.description.trim() : current.description,
    };
    productCache.set(id, tempUpdated);
  }

  const promise = (async () => {
    await ensureInitialProductsSeeded();

    const [rows] = await pool.query<ProductRow[]>('SELECT * FROM products WHERE id = ? LIMIT 1', [id]);
    const existingRow = rows[0];
    if (!existingRow) {
      productCache.delete(id);
      return null;
    }

    const existing = mapRowToProduct(existingRow);

    let categoryId = existingRow.category_id;
    let categoryName = existing.category;
    if (input.category !== undefined) {
      const validatedCat = await validateAndGetCategory(input.category);
      categoryId = validatedCat.id;
      categoryName = validatedCat.name;
    }

    const updatedPrice = input.price !== undefined
      ? (input.price.startsWith('₹') ? input.price : `₹${input.price}`)
      : existing.price;

    const updatedPriceNumeric = input.priceNumeric !== undefined
      ? input.priceNumeric
      : (input.price !== undefined ? parsePriceNumeric(input.price) : existing.priceNumeric);

    const updated: Product = {
      id: existing.id,
      name: input.name !== undefined ? input.name.trim() : existing.name,
      subtitle: input.subtitle !== undefined ? input.subtitle.trim() : existing.subtitle,
      badge: input.badge !== undefined ? input.badge : existing.badge,
      badgeBg: input.badgeBg !== undefined ? input.badgeBg : existing.badgeBg,
      originalPrice: input.originalPrice !== undefined
        ? (input.originalPrice.startsWith('₹') ? input.originalPrice : `₹${input.originalPrice}`)
        : existing.originalPrice,
      price: updatedPrice,
      priceNumeric: updatedPriceNumeric,
      rating: input.rating !== undefined ? input.rating : existing.rating,
      image: input.image !== undefined ? input.image : existing.image,
      images: input.images !== undefined ? input.images : existing.images,
      category: categoryName,
      light: input.light !== undefined ? input.light : existing.light,
      stock: input.stock !== undefined ? input.stock : existing.stock,
      description: input.description !== undefined ? input.description.trim() : existing.description,
    };

    await pool.query<ResultSetHeader>(
      `UPDATE products SET
        name = ?, subtitle = ?, badge = ?, badge_bg = ?,
        original_price = ?, price = ?, price_numeric = ?, rating = ?,
        image = ?, images = ?, category = ?, category_id = ?,
        light = ?, stock = ?, description = ?
      WHERE id = ?`,
      [
        updated.name,
        updated.subtitle,
        updated.badge ?? null,
        updated.badgeBg ?? '#06452E',
        updated.originalPrice,
        updated.price,
        updated.priceNumeric,
        updated.rating,
        updated.image,
        updated.images ? JSON.stringify(updated.images) : null,
        updated.category,
        categoryId,
        updated.light,
        updated.stock,
        updated.description,
        id,
      ]
    );

    productCache.set(id, updated);
    return updated;
  })();

  if (!tempUpdated) {
    return promise as any;
  }

  return Object.assign(promise, tempUpdated) as any;
}

export function deleteProduct(id: string): Promise<boolean> & boolean {
  const existed = productCache.delete(id);

  const promise = (async () => {
    await ensureInitialProductsSeeded();
    const [result] = await pool.query<ResultSetHeader>('DELETE FROM products WHERE id = ?', [id]);
    productCache.delete(id);
    return (result.affectedRows ?? 0) > 0;
  })();

  return Object.assign(promise, existed) as any;
}
