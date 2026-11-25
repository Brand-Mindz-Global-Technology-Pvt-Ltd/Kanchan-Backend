import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { pool } from '../config/db.ts';
import type { WishlistItem, CustomerWishlist, WishlistBadgeVariant } from '../types/wishlist.types.ts';
import * as productService from './product.service.ts';

interface WishlistRow extends RowDataPacket {
  wishlist_item_id: number;
  customer_id: string;
  product_id: string;
  created_at: Date | string;
  name: string;
  subtitle: string | null;
  badge: string | null;
  badge_bg: string | null;
  original_price: string | number | null;
  price: string | number;
  price_numeric: string | number;
  image: string;
  category: string;
  description: string;
  stock: number;
}

function parsePriceNumeric(priceStr?: string | number | null): number {
  if (priceStr === undefined || priceStr === null) return 0;
  if (typeof priceStr === 'number') return priceStr;
  const numericOnly = String(priceStr).replace(/[^0-9.]/g, '');
  const parsed = parseFloat(numericOnly);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function resolveBadgeVariant(badge?: string | null): WishlistBadgeVariant {
  if (!badge) return 'green';
  const upper = badge.toUpperCase();
  if (upper === 'FLOWERING' || upper === 'AMBER') {
    return 'amber';
  }
  if (upper === 'SAGE') {
    return 'sage';
  }
  return 'green';
}

function mapRowToWishlistItem(row: WishlistRow): WishlistItem {
  const price = Number(row.price_numeric) || parsePriceNumeric(row.price);
  const originalPrice = parsePriceNumeric(row.original_price) || price;
  const subtitleDesc = row.subtitle
    ? `${row.subtitle} · ${row.category}`
    : (row.description || '');

  return {
    productId: row.product_id,
    name: row.name,
    badge: row.badge || '',
    badgeVariant: resolveBadgeVariant(row.badge),
    description: subtitleDesc,
    price,
    originalPrice,
    image: row.image,
    isFavorite: true,
    addedAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

export const getWishlist = async (customerId: string): Promise<CustomerWishlist> => {
  const [rows] = await pool.query<WishlistRow[]>(
    `SELECT 
       w.id as wishlist_item_id,
       w.customer_id,
       w.product_id,
       w.created_at,
       p.name,
       p.subtitle,
       p.badge,
       p.badge_bg,
       p.original_price,
       p.price,
       p.price_numeric,
       p.image,
       p.category,
       p.description,
       p.stock
     FROM wishlist_items w
     JOIN products p ON w.product_id = p.id
     WHERE w.customer_id = ?
     ORDER BY w.created_at DESC`,
    [customerId]
  );

  const items = rows.map(mapRowToWishlistItem);
  const latestDate = items[0]?.addedAt || new Date().toISOString();

  return {
    customerId,
    items,
    count: items.length,
    updatedAt: latestDate,
  };
};

export const addToWishlist = async (
  customerId: string,
  productId: string
): Promise<{ wishlist: CustomerWishlist; item: WishlistItem }> => {
  const product = await productService.getProductById(productId);
  if (!product) {
    throw new Error(`PRODUCT_NOT_FOUND: Product with ID '${productId}' does not exist`);
  }

  // Check if already in wishlist
  const [existing] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM wishlist_items WHERE customer_id = ? AND product_id = ? LIMIT 1',
    [customerId, product.id]
  );

  if (existing.length > 0) {
    throw new Error(`DUPLICATE_ITEM: Product '${product.name}' is already in your wishlist`);
  }

  await pool.query<ResultSetHeader>(
    'INSERT INTO wishlist_items (customer_id, product_id) VALUES (?, ?)',
    [customerId, product.id]
  );

  const updatedWishlist = await getWishlist(customerId);
  const foundItem = updatedWishlist.items.find((i) => i.productId === product.id);

  const originalPrice = parsePriceNumeric(product.originalPrice) || product.priceNumeric;
  const description = product.subtitle
    ? `${product.subtitle} · ${product.category}`
    : product.description;

  const newItem: WishlistItem = foundItem || {
    productId: product.id,
    name: product.name,
    badge: product.badge || '',
    badgeVariant: resolveBadgeVariant(product.badge),
    description,
    price: product.priceNumeric,
    originalPrice,
    image: product.image,
    isFavorite: true,
    addedAt: new Date().toISOString(),
  };

  return {
    wishlist: updatedWishlist,
    item: newItem,
  };
};

export const removeFromWishlist = async (
  customerId: string,
  productId: string
): Promise<CustomerWishlist | null> => {
  const [existing] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM wishlist_items WHERE customer_id = ? AND product_id = ? LIMIT 1',
    [customerId, productId]
  );

  if (existing.length === 0) {
    return null;
  }

  await pool.query<ResultSetHeader>(
    'DELETE FROM wishlist_items WHERE customer_id = ? AND product_id = ?',
    [customerId, productId]
  );

  return await getWishlist(customerId);
};

export const isInWishlist = async (
  customerId: string,
  productId: string
): Promise<boolean> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM wishlist_items WHERE customer_id = ? AND product_id = ? LIMIT 1',
    [customerId, productId]
  );
  return rows.length > 0;
};

export const clearWishlist = async (customerId: string): Promise<CustomerWishlist> => {
  await pool.query('DELETE FROM wishlist_items WHERE customer_id = ?', [customerId]);
  return {
    customerId,
    items: [],
    count: 0,
    updatedAt: new Date().toISOString(),
  };
};
