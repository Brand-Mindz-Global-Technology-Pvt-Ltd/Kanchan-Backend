import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { pool } from '../config/db.ts';
import type { CartItem, CartSummary, AddToCartInput } from '../types/cart.types.ts';

interface CustomerCartRecord {
  items: CartItem[];
  updatedAt: string;
}

interface CartItemRow extends RowDataPacket {
  cart_item_id: number;
  customer_id: string;
  product_id: string;
  variant: string;
  pot_type: string;
  price: string | number;
  original_price: string | number | null;
  quantity: number;
  created_at: Date | string;
  updated_at: Date | string;
  product_name: string;
  product_image: string;
  current_price_numeric: string | number;
  current_original_price_str: string;
  product_stock: number;
}

const FREE_SHIPPING_THRESHOLD = 799;
const STANDARD_DELIVERY_FEE = 99;

// In-memory cache synced with MySQL to support synchronous downstream modules (e.g. order placement)
const carts: Map<string, CustomerCartRecord> = new Map();

function parsePriceNumeric(priceStr?: string | number | null): number | undefined {
  if (priceStr === undefined || priceStr === null) return undefined;
  if (typeof priceStr === 'number') return priceStr;
  const numericOnly = String(priceStr).replace(/[^0-9.]/g, '');
  const parsed = parseFloat(numericOnly);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function mapRowToCartItem(row: CartItemRow): CartItem {
  const unitPrice = Number(row.price) || Number(row.current_price_numeric) || 0;
  const origPrice = row.original_price !== null && row.original_price !== undefined
    ? Number(row.original_price)
    : parsePriceNumeric(row.current_original_price_str);

  const quantity = Number(row.quantity) || 1;
  const itemSubtotal = unitPrice * quantity;
  const itemSavings = origPrice && origPrice > unitPrice ? (origPrice - unitPrice) * quantity : 0;

  return {
    productId: row.product_id,
    name: row.product_name,
    variant: row.variant ? row.variant : undefined,
    potType: row.pot_type ? row.pot_type : undefined,
    price: unitPrice,
    originalPrice: origPrice && origPrice > unitPrice ? origPrice : undefined,
    quantity,
    image: row.product_image,
    itemSubtotal,
    itemSavings,
  };
}

export const calculateCartSummary = (
  customerId: string,
  items: CartItem[],
  updatedAt?: string
): CartSummary => {
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.itemSubtotal, 0);
  const totalSavings = items.reduce((sum, item) => sum + item.itemSavings, 0);
  const isFreeShipping = subtotal >= FREE_SHIPPING_THRESHOLD;
  const deliveryFee = subtotal === 0 || isFreeShipping ? 0 : STANDARD_DELIVERY_FEE;
  const totalPayable = subtotal + deliveryFee;

  return {
    customerId,
    items: [...items],
    itemCount,
    subtotal,
    totalSavings,
    deliveryFee,
    isFreeShipping,
    freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
    totalPayable,
    updatedAt: updatedAt || new Date().toISOString(),
  };
};

export function getCart(customerId: string): Promise<CartSummary> & CartSummary {
  const cached = carts.get(customerId);
  const syncSummary = cached
    ? calculateCartSummary(customerId, cached.items, cached.updatedAt)
    : calculateCartSummary(customerId, []);

  const promise = (async () => {
    const [rows] = await pool.query<CartItemRow[]>(
      `SELECT
        c.id as cart_item_id,
        c.customer_id,
        c.product_id,
        c.variant,
        c.pot_type,
        c.price,
        c.original_price,
        c.quantity,
        c.created_at,
        c.updated_at,
        p.name as product_name,
        p.image as product_image,
        p.price_numeric as current_price_numeric,
        p.original_price as current_original_price_str,
        p.stock as product_stock
      FROM cart_items c
      JOIN products p ON c.product_id = p.id
      WHERE c.customer_id = ?
      ORDER BY c.created_at ASC, c.id ASC`,
      [customerId]
    );

    const items = rows.map(mapRowToCartItem);
    const latestUpdated = rows.length > 0 && rows[rows.length - 1]?.updated_at
      ? (rows[rows.length - 1]?.updated_at instanceof Date
          ? (rows[rows.length - 1]?.updated_at as Date).toISOString()
          : String(rows[rows.length - 1]?.updated_at))
      : new Date().toISOString();

    carts.set(customerId, { items, updatedAt: latestUpdated });
    return calculateCartSummary(customerId, items, latestUpdated);
  })();

  return Object.assign(promise, syncSummary) as any;
}

export function addItemToCart(
  customerId: string,
  input: AddToCartInput
): Promise<{ cart: CartSummary }> & { cart: CartSummary } {
  const quantityToAdd = input.quantity ?? 1;
  if (!Number.isInteger(quantityToAdd) || quantityToAdd <= 0) {
    throw new Error('INVALID_QUANTITY: Quantity must be a positive integer greater than 0');
  }

  const cached = carts.get(customerId);
  const fallbackSummary = cached
    ? calculateCartSummary(customerId, cached.items, cached.updatedAt)
    : calculateCartSummary(customerId, []);

  const promise = (async () => {
    // 1. Validate product existence in MySQL
    const [prodRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, name, price_numeric, original_price, stock, image FROM products WHERE id = ? LIMIT 1',
      [input.productId.trim()]
    );
    const product = prodRows[0];
    if (!product) {
      throw new Error(`PRODUCT_NOT_FOUND: Product with ID '${input.productId}' does not exist`);
    }

    const stock = Number(product['stock']) || 0;
    const name = String(product['name']);
    const priceNumeric = Number(product['price_numeric']) || 0;
    const origNumeric = parsePriceNumeric(product['original_price']);
    const originalPrice = origNumeric && origNumeric > priceNumeric ? origNumeric : null;

    if (stock <= 0) {
      throw new Error(`OUT_OF_STOCK: Product '${name}' is out of stock (available stock: 0)`);
    }

    const normVariant = input.variant ? input.variant.trim() : '';
    const normPotType = input.potType ? input.potType.trim() : '';

    // Check existing item in MySQL
    const [existingRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, quantity FROM cart_items WHERE customer_id = ? AND product_id = ? AND variant = ? AND pot_type = ? LIMIT 1',
      [customerId, product['id'], normVariant, normPotType]
    );

    const existingRow = existingRows[0];
    const currentQtyInCart = existingRow ? Number(existingRow['quantity']) : 0;
    const newTotalQuantity = currentQtyInCart + quantityToAdd;

    if (newTotalQuantity > stock) {
      throw new Error(
        `STOCK_LIMIT_EXCEEDED: Requested quantity (${newTotalQuantity}) exceeds available stock (${stock}) for '${name}'`
      );
    }

    const now = new Date();
    if (existingRow) {
      await pool.query<ResultSetHeader>(
        'UPDATE cart_items SET quantity = ?, price = ?, original_price = ?, updated_at = ? WHERE id = ?',
        [newTotalQuantity, priceNumeric, originalPrice, now, existingRow['id']]
      );
    } else {
      await pool.query<ResultSetHeader>(
        `INSERT INTO cart_items (customer_id, product_id, variant, pot_type, price, original_price, quantity, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [customerId, product['id'], normVariant, normPotType, priceNumeric, originalPrice, quantityToAdd, now, now]
      );
    }

    const cart = await getCart(customerId);
    return { cart };
  })();

  return Object.assign(promise, { cart: fallbackSummary }) as any;
}

export function updateCartItemQuantity(
  customerId: string,
  productId: string,
  quantity: number,
  variant?: string,
  potType?: string
): (Promise<CartSummary | null> & CartSummary) | null {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error('INVALID_QUANTITY: Quantity must be a non-negative integer (0 or greater)');
  }

  const cached = carts.get(customerId);
  const fallbackSummary = cached
    ? calculateCartSummary(customerId, cached.items, cached.updatedAt)
    : calculateCartSummary(customerId, []);

  const promise = (async () => {
    const normVariant = variant !== undefined ? variant.trim() : null;
    const normPotType = potType !== undefined ? potType.trim() : null;

    let query = `
      SELECT c.id, c.quantity, p.id as product_id, p.name as product_name, p.stock, p.price_numeric, p.original_price as prod_orig_price
      FROM cart_items c
      JOIN products p ON c.product_id = p.id
      WHERE c.customer_id = ? AND c.product_id = ?
    `;
    const params: (string | number)[] = [customerId, productId.trim()];

    if (normVariant !== null) {
      query += ' AND c.variant = ?';
      params.push(normVariant);
    }
    if (normPotType !== null) {
      query += ' AND c.pot_type = ?';
      params.push(normPotType);
    }
    query += ' LIMIT 1';

    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    const item = rows[0];
    if (!item) {
      return null;
    }

    if (quantity === 0) {
      await pool.query('DELETE FROM cart_items WHERE id = ?', [item['id']]);
      return await getCart(customerId);
    }

    const stock = Number(item['stock']) || 0;
    const name = String(item['product_name']);

    if (stock <= 0) {
      throw new Error(`OUT_OF_STOCK: Product '${name}' is out of stock (available stock: 0)`);
    }

    if (quantity > stock) {
      throw new Error(
        `STOCK_LIMIT_EXCEEDED: Requested quantity (${quantity}) exceeds available stock (${stock}) for '${name}'`
      );
    }

    const now = new Date();
    await pool.query(
      'UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ?',
      [quantity, now, item['id']]
    );

    return await getCart(customerId);
  })();

  return Object.assign(promise, fallbackSummary) as any;
}

export function removeCartItem(
  customerId: string,
  productId: string,
  variant?: string,
  potType?: string
): (Promise<CartSummary | null> & CartSummary) | null {
  const cached = carts.get(customerId);
  const fallbackSummary = cached
    ? calculateCartSummary(customerId, cached.items, cached.updatedAt)
    : calculateCartSummary(customerId, []);

  const promise = (async () => {
    const normVariant = variant !== undefined ? variant.trim() : null;
    const normPotType = potType !== undefined ? potType.trim() : null;

    let query = 'SELECT id FROM cart_items WHERE customer_id = ? AND product_id = ?';
    const params: (string | number)[] = [customerId, productId.trim()];

    if (normVariant !== null) {
      query += ' AND variant = ?';
      params.push(normVariant);
    }
    if (normPotType !== null) {
      query += ' AND pot_type = ?';
      params.push(normPotType);
    }
    query += ' LIMIT 1';

    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    const item = rows[0];
    if (!item) {
      return null;
    }

    await pool.query('DELETE FROM cart_items WHERE id = ?', [item['id']]);
    return await getCart(customerId);
  })();

  return Object.assign(promise, fallbackSummary) as any;
}

export function clearCart(customerId: string): Promise<CartSummary> & CartSummary {
  const emptySummary = calculateCartSummary(customerId, []);

  const promise = (async () => {
    await pool.query('DELETE FROM cart_items WHERE customer_id = ?', [customerId]);
    carts.set(customerId, { items: [], updatedAt: new Date().toISOString() });
    return emptySummary;
  })();

  return Object.assign(promise, emptySummary) as any;
}
