import crypto from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../config/db.ts';
import type {
  Order,
  OrderItem,
  OrderProduct,
  CreateOrderInput,
  PaymentMethod,
  OrderStatus,
} from '../types/order.types.ts';
import type { SafeCustomer } from '../types/customer.types.ts';
import type { CustomerAddress } from '../types/address.types.ts';
import * as cartService from './cart.service.ts';

interface OrderRow extends RowDataPacket {
  id: string;
  order_number: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_address: string;
  delivery_address_id: string | null;
  delivery_address_json: any;
  item_count: number;
  subtotal: string | number;
  total_savings: string | number;
  delivery_fee: string | number;
  free_shipping_threshold: string | number;
  total_amount: string | number;
  payment_method: PaymentMethod;
  payment_status: any;
  order_status: OrderStatus;
  order_date: Date | string;
  stock_restored: number | boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

interface OrderItemRow extends RowDataPacket {
  id: number;
  order_id: string;
  product_id: string;
  product_name: string;
  variant: string | null;
  pot_type: string | null;
  price: string | number;
  original_price: string | number | null;
  discount_per_unit: string | number;
  quantity: number;
  total_price: string | number;
  total_savings: string | number;
  image: string;
  created_at: Date | string;
}

const FREE_SHIPPING_THRESHOLD = 799;
const STANDARD_DELIVERY_FEE = 99;

// In-memory cache synced with MySQL to support synchronous downstream modules (e.g. admin controller)
const ordersById: Map<string, Order> = new Map();

function parsePriceNumeric(priceStr?: string | number | null): number | undefined {
  if (priceStr === undefined || priceStr === null) return undefined;
  if (typeof priceStr === 'number') return priceStr;
  const numericOnly = String(priceStr).replace(/[^0-9.]/g, '');
  const parsed = parseFloat(numericOnly);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function mapRowToOrderItem(row: OrderItemRow): OrderItem {
  return {
    productId: row.product_id,
    productName: row.product_name,
    variant: row.variant ?? undefined,
    potType: row.pot_type ?? undefined,
    price: Number(row.price),
    originalPrice: row.original_price != null ? Number(row.original_price) : undefined,
    discountPerUnit: Number(row.discount_per_unit) || 0,
    quantity: row.quantity,
    totalPrice: Number(row.total_price),
    totalSavings: Number(row.total_savings) || 0,
    image: row.image,
  };
}

function mapRowToOrder(row: OrderRow, items: OrderItem[]): Order {
  let deliveryAddress: CustomerAddress;
  if (row.delivery_address_json) {
    deliveryAddress = typeof row.delivery_address_json === 'string'
      ? JSON.parse(row.delivery_address_json)
      : row.delivery_address_json;
  } else {
    deliveryAddress = {
      id: row.delivery_address_id || '',
      customerId: row.customer_id,
      name: row.customer_name,
      phone: row.customer_phone,
      pincode: '',
      flatBuilding: '',
      streetColony: row.customer_address,
      tag: 'HOME',
      isDefault: false,
      createdAt: '',
      updatedAt: '',
    };
  }

  const orderProducts: OrderProduct[] = items.map(item => ({
    productId: item.productId,
    productName: item.productName,
    quantity: item.quantity,
    price: item.price,
  }));

  const orderDateStr = row.order_date instanceof Date
    ? row.order_date.toISOString().split('T')[0]!
    : String(row.order_date).split('T')[0]!;

  const createdAtStr = row.created_at instanceof Date
    ? row.created_at.toISOString()
    : String(row.created_at);

  const updatedAtStr = row.updated_at instanceof Date
    ? row.updated_at.toISOString()
    : String(row.updated_at);

  return {
    id: row.id,
    orderNumber: row.order_number,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    customerAddress: row.customer_address,
    deliveryAddress,
    items,
    products: orderProducts,
    itemCount: row.item_count,
    subtotal: Number(row.subtotal),
    totalSavings: Number(row.total_savings),
    deliveryFee: Number(row.delivery_fee),
    freeShippingThreshold: Number(row.free_shipping_threshold),
    totalAmount: Number(row.total_amount),
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    orderStatus: row.order_status,
    orderDate: orderDateStr,
    stockRestored: Boolean(row.stock_restored),
    createdAt: createdAtStr,
    updatedAt: updatedAtStr,
  };
}

export function createOrder(
  customer: SafeCustomer,
  input: CreateOrderInput
): Promise<Order> & Order {
  // Synchronous fallback stub to satisfy sync callers if any
  const syncFallbackOrder: Order = {
    id: `ord-${Date.now()}`,
    orderNumber: `ORD-${Date.now()}`,
    customerId: customer.id,
    customerName: customer.fullName,
    customerEmail: customer.email,
    customerPhone: customer.mobileNumber || '',
    customerAddress: '',
    deliveryAddress: {
      id: input.deliveryAddressId || '',
      customerId: customer.id,
      name: customer.fullName,
      phone: customer.mobileNumber || '',
      pincode: '',
      flatBuilding: '',
      streetColony: '',
      tag: 'HOME',
      isDefault: false,
      createdAt: '',
      updatedAt: '',
    },
    items: [],
    products: [],
    itemCount: 0,
    subtotal: 0,
    totalSavings: 0,
    deliveryFee: 0,
    freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
    totalAmount: 0,
    paymentMethod: input.paymentMethod === 'cod' ? 'cod' : 'online',
    paymentStatus: 'pending',
    orderStatus: 'pending',
    orderDate: new Date().toISOString().split('T')[0]!,
    stockRestored: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const promise = (async () => {
    // 1. Validate deliveryAddressId
    const rawAddressId =
      input.deliveryAddressId ||
      (input as any).shippingAddressId ||
      (input as any).deliveryAddress?.id ||
      (input as any).shippingAddress?.id;

    if (!rawAddressId || typeof rawAddressId !== 'string' || !rawAddressId.trim()) {
      throw new Error("Validation failed: 'deliveryAddressId' is required and must be a valid address ID");
    }
    const addressId = rawAddressId.trim();

    // 2. Verify delivery address belongs to the authenticated customer in MySQL
    const [addressRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, customer_id, name, phone, pincode, flat_building, street_colony, landmark, tag, is_default, created_at, updated_at
       FROM customer_addresses
       WHERE customer_id = ? AND id = ?
       LIMIT 1`,
      [customer.id, addressId]
    );

    const addrRow = addressRows[0];
    if (!addrRow) {
      throw new Error(
        'DELIVERY_ADDRESS_NOT_FOUND: Selected delivery address does not exist or does not belong to this customer'
      );
    }

    const deliveryAddress: CustomerAddress = {
      id: addrRow['id'],
      customerId: addrRow['customer_id'],
      name: addrRow['name'],
      phone: addrRow['phone'],
      pincode: addrRow['pincode'],
      flatBuilding: addrRow['flat_building'],
      streetColony: addrRow['street_colony'],
      landmark: addrRow['landmark'] ?? undefined,
      tag: addrRow['tag'],
      isDefault: Boolean(addrRow['is_default']),
      createdAt:
        addrRow['created_at'] instanceof Date
          ? addrRow['created_at'].toISOString()
          : String(addrRow['created_at']),
      updatedAt:
        addrRow['updated_at'] instanceof Date
          ? addrRow['updated_at'].toISOString()
          : String(addrRow['updated_at']),
    };

    // 3. Determine if Buy Now or Cart Checkout
    let isBuyNow = false;
    let rawItems: {
      productId: string;
      quantity: number;
      variant?: string | undefined;
      potType?: string | undefined;
    }[] = [];

    if (input.buyNowItem && input.buyNowItem.productId) {
      isBuyNow = true;
      rawItems = [
        {
          productId: input.buyNowItem.productId,
          quantity: input.buyNowItem.quantity ?? 1,
          variant: input.buyNowItem.variant,
          potType: input.buyNowItem.potType,
        },
      ];
    } else if (Array.isArray(input.items) && input.items.length > 0) {
      isBuyNow = Boolean(input.isBuyNow ?? true);
      rawItems = input.items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity ?? 1,
        variant: i.variant,
        potType: i.potType,
      }));
    } else {
      isBuyNow = false;
      const [cartRows] = await pool.query<RowDataPacket[]>(
        `SELECT ci.product_id, ci.variant, ci.pot_type, ci.quantity
         FROM cart_items ci
         WHERE ci.customer_id = ?
         ORDER BY ci.created_at ASC`,
        [customer.id]
      );

      if (cartRows.length === 0) {
        throw new Error('EMPTY_CART: Cannot create an order because the shopping cart is empty');
      }

      rawItems = cartRows.map((r) => ({
        productId: r['product_id'],
        quantity: Number(r['quantity']),
        variant: r['variant'] || undefined,
        potType: r['pot_type'] || undefined,
      }));
    }

    // Validate raw items input
    for (const item of rawItems) {
      if (!item.productId || typeof item.productId !== 'string' || !item.productId.trim()) {
        throw new Error("Validation failed: Each item must have a valid 'productId'");
      }
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new Error('Validation failed: Item quantity must be a positive integer greater than 0');
      }
    }

    // 4. Begin MySQL Transaction for Atomic Stock Verification, Decrement & Order Creation
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      const orderItems: OrderItem[] = [];
      const orderProducts: OrderProduct[] = [];
      let subtotal = 0;
      let totalSavings = 0;

      // Validate products and lock rows FOR UPDATE to prevent race conditions
      for (const item of rawItems) {
        const [prodRows] = await connection.query<RowDataPacket[]>(
          `SELECT id, name, category, price, original_price, price_numeric, stock, image
           FROM products
           WHERE id = ?
           FOR UPDATE`,
          [item.productId.trim()]
        );

        const prod = prodRows[0];
        if (!prod) {
          throw new Error(`PRODUCT_NOT_FOUND: Product '${item.productId}' no longer exists`);
        }

        const currentStock = Number(prod['stock']);
        if (currentStock <= 0) {
          throw new Error(
            `OUT_OF_STOCK: Product '${prod['name']}' is currently out of stock (available stock: 0)`
          );
        }
        if (item.quantity > currentStock) {
          throw new Error(
            `INSUFFICIENT_STOCK: Requested quantity (${item.quantity}) exceeds available stock (${currentStock}) for '${prod['name']}'`
          );
        }

        // Server-side calculation only - never trust frontend prices
        const priceNumeric = Number(prod['price_numeric']);
        const origNumeric = parsePriceNumeric(prod['original_price']);
        const hasOffer = origNumeric !== undefined && origNumeric > priceNumeric;
        const normalPrice = hasOffer ? origNumeric! : priceNumeric;
        const effectivePrice = priceNumeric;
        const discountPerUnit = hasOffer ? normalPrice - effectivePrice : 0;
        const itemTotal = effectivePrice * item.quantity;
        const itemSavings = discountPerUnit * item.quantity;

        subtotal += itemTotal;
        totalSavings += itemSavings;

        orderItems.push({
          productId: prod['id'],
          productName: prod['name'],
          variant: item.variant,
          potType: item.potType,
          price: effectivePrice,
          originalPrice: hasOffer ? normalPrice : undefined,
          discountPerUnit,
          quantity: item.quantity,
          totalPrice: itemTotal,
          totalSavings: itemSavings,
          image: prod['image'],
        });

        orderProducts.push({
          productId: prod['id'],
          productName: prod['name'],
          quantity: item.quantity,
          price: effectivePrice,
        });

        // Decrement stock in MySQL inside transaction
        await connection.query(
          'UPDATE products SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [item.quantity, prod['id']]
        );
      }

      // Delivery fee calculation
      const deliveryFee = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_DELIVERY_FEE;
      const totalAmount = subtotal + deliveryFee;

      // Payment method & status handling
      const paymentMethod: PaymentMethod = input.paymentMethod === 'cod' ? 'cod' : 'online';
      const now = new Date();
      const orderId = `ord-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      const orderNumber = `ORD-${now.getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

      const formattedAddress = [
        deliveryAddress.name,
        deliveryAddress.flatBuilding,
        deliveryAddress.streetColony,
        deliveryAddress.landmark ? `Landmark: ${deliveryAddress.landmark}` : undefined,
        `Pincode: ${deliveryAddress.pincode}`,
        `Phone: ${deliveryAddress.phone}`,
      ]
        .filter(Boolean)
        .join(', ');

      const orderDateStr = now.toISOString().split('T')[0]!;
      const itemCount = orderItems.reduce((acc, i) => acc + i.quantity, 0);

      // Insert Order record
      await connection.query(
        `INSERT INTO orders (
          id, order_number, customer_id, customer_name, customer_email, customer_phone,
          customer_address, delivery_address_id, delivery_address_json, item_count,
          subtotal, total_savings, delivery_fee, free_shipping_threshold, total_amount,
          payment_method, payment_status, order_status, order_date, stock_restored,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', ?, 0, ?, ?)`,
        [
          orderId,
          orderNumber,
          customer.id,
          deliveryAddress.name || customer.fullName,
          customer.email,
          deliveryAddress.phone || customer.mobileNumber || '',
          formattedAddress,
          deliveryAddress.id,
          JSON.stringify(deliveryAddress),
          itemCount,
          subtotal,
          totalSavings,
          deliveryFee,
          FREE_SHIPPING_THRESHOLD,
          totalAmount,
          paymentMethod,
          orderDateStr,
          now,
          now,
        ]
      );

      // Insert Order Items
      for (const item of orderItems) {
        await connection.query(
          `INSERT INTO order_items (
            order_id, product_id, product_name, variant, pot_type, price,
            original_price, discount_per_unit, quantity, total_price, total_savings,
            image, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            item.productId,
            item.productName,
            item.variant || null,
            item.potType || null,
            item.price,
            item.originalPrice || null,
            item.discountPerUnit,
            item.quantity,
            item.totalPrice,
            item.totalSavings,
            item.image,
            now,
          ]
        );
      }

      // If Cart Checkout, clear the customer's cart atomically in the transaction
      if (!isBuyNow) {
        await connection.query('DELETE FROM cart_items WHERE customer_id = ?', [customer.id]);
      }

      // Commit the transaction
      await connection.commit();

      // If Cart Checkout, also clear the in-memory cart cache
      if (!isBuyNow) {
        cartService.clearCart(customer.id);
      }

      const newOrder: Order = {
        id: orderId,
        orderNumber,
        customerId: customer.id,
        customerName: deliveryAddress.name || customer.fullName,
        customerEmail: customer.email,
        customerPhone: deliveryAddress.phone || customer.mobileNumber || '',
        customerAddress: formattedAddress,
        deliveryAddress: { ...deliveryAddress },
        items: orderItems,
        products: orderProducts,
        itemCount,
        subtotal,
        totalSavings,
        deliveryFee,
        freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
        totalAmount,
        paymentMethod,
        paymentStatus: 'pending',
        orderStatus: 'pending',
        orderDate: orderDateStr,
        stockRestored: false,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      ordersById.set(newOrder.id, newOrder);
      return newOrder;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  })();

  return Object.assign(promise, syncFallbackOrder) as any;
}

export function getOrdersByCustomer(customerId: string): Promise<Order[]> & Order[] {
  const cachedList: Order[] = [];
  for (const o of ordersById.values()) {
    if (o.customerId === customerId) {
      cachedList.push({ ...o });
    }
  }
  cachedList.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const promise = (async () => {
    const [orderRows] = await pool.query<OrderRow[]>(
      'SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC',
      [customerId]
    );

    if (orderRows.length === 0) {
      return [];
    }

    const orderIds = orderRows.map((r) => r.id);
    const [itemRows] = await pool.query<OrderItemRow[]>(
      `SELECT * FROM order_items WHERE order_id IN (${orderIds.map(() => '?').join(',')}) ORDER BY id ASC`,
      orderIds
    );

    const itemsByOrderId = new Map<string, OrderItem[]>();
    for (const itemRow of itemRows) {
      const list = itemsByOrderId.get(itemRow.order_id) || [];
      list.push(mapRowToOrderItem(itemRow));
      itemsByOrderId.set(itemRow.order_id, list);
    }

    const orders = orderRows.map((r) => {
      const order = mapRowToOrder(r, itemsByOrderId.get(r.id) || []);
      ordersById.set(order.id, order);
      return order;
    });

    return orders;
  })();

  return Object.assign(cachedList, {
    then: (resolve: any, reject: any) => promise.then(resolve, reject),
    catch: (reject: any) => promise.catch(reject),
    finally: (cb: any) => promise.finally(cb),
  }) as any;
}

export function getOrderById(
  customerId: string,
  orderId: string
): (Promise<Order | undefined> & Order) | undefined {
  const trimmed = orderId.trim();
  const cached = ordersById.get(trimmed);
  const validCached = cached && cached.customerId === customerId ? cached : undefined;

  const promise = (async () => {
    const [orderRows] = await pool.query<OrderRow[]>(
      'SELECT * FROM orders WHERE id = ? AND customer_id = ? LIMIT 1',
      [trimmed, customerId]
    );
    const row = orderRows[0];
    if (!row) {
      if (cached && cached.customerId === customerId) {
        ordersById.delete(trimmed);
      }
      return undefined;
    }

    const [itemRows] = await pool.query<OrderItemRow[]>(
      'SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC',
      [row.id]
    );

    const items = itemRows.map(mapRowToOrderItem);
    const order = mapRowToOrder(row, items);
    ordersById.set(order.id, order);
    return order;
  })();

  if (validCached) {
    return Object.assign(promise, validCached) as any;
  }
  return promise as any;
}

export function cancelOrder(
  customerId: string,
  orderId: string
): Promise<Order> & Order {
  const cached = ordersById.get(orderId.trim());
  const fallbackOrder = cached && cached.customerId === customerId ? cached : ({} as Order);

  const promise = (async () => {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      const [rows] = await connection.query<OrderRow[]>(
        'SELECT * FROM orders WHERE id = ? AND customer_id = ? FOR UPDATE',
        [orderId.trim(), customerId]
      );
      const row = rows[0];
      if (!row) {
        throw new Error(`ORDER_NOT_FOUND: Order with ID '${orderId}' not found`);
      }

      if (row.order_status === 'cancelled') {
        throw new Error(`ORDER_ALREADY_CANCELLED: Order '${row.order_number}' is already cancelled`);
      }

      if (row.order_status !== 'pending' && row.order_status !== 'processing') {
        throw new Error(
          `ORDER_CANNOT_BE_CANCELLED: Order '${row.order_number}' with status '${row.order_status}' cannot be cancelled`
        );
      }

      const [itemRows] = await connection.query<OrderItemRow[]>(
        'SELECT * FROM order_items WHERE order_id = ?',
        [row.id]
      );

      // Restore stock only once when an order is cancelled
      if (!row.stock_restored) {
        for (const item of itemRows) {
          await connection.query(
            'UPDATE products SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [item.quantity, item.product_id]
          );
        }
      }

      const now = new Date();
      await connection.query(
        'UPDATE orders SET order_status = ?, stock_restored = 1, updated_at = ? WHERE id = ?',
        ['cancelled', now, row.id]
      );

      await connection.commit();

      const items = itemRows.map(mapRowToOrderItem);
      const updatedOrder = mapRowToOrder(
        {
          ...row,
          order_status: 'cancelled',
          stock_restored: 1,
          updated_at: now,
        },
        items
      );

      ordersById.set(updatedOrder.id, updatedOrder);
      return updatedOrder;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  })();

  return Object.assign(promise, fallbackOrder) as any;
}

export function getAllOrders(status?: string): Promise<Order[]> & Order[] {
  const normalizedStatus = status?.trim().toLowerCase();
  const cachedList: Order[] = [];
  for (const o of ordersById.values()) {
    if (!normalizedStatus || o.orderStatus.toLowerCase() === normalizedStatus) {
      cachedList.push({ ...o });
    }
  }
  cachedList.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const promise = (async () => {
    let query = 'SELECT * FROM orders';
    const params: string[] = [];
    if (normalizedStatus) {
      query += ' WHERE LOWER(order_status) = ?';
      params.push(normalizedStatus);
    }
    query += ' ORDER BY created_at DESC';

    const [orderRows] = await pool.query<OrderRow[]>(query, params);
    if (orderRows.length === 0) {
      return [];
    }

    const orderIds = orderRows.map((r) => r.id);
    const [itemRows] = await pool.query<OrderItemRow[]>(
      `SELECT * FROM order_items WHERE order_id IN (${orderIds.map(() => '?').join(',')}) ORDER BY id ASC`,
      orderIds
    );

    const itemsByOrderId = new Map<string, OrderItem[]>();
    for (const itemRow of itemRows) {
      const list = itemsByOrderId.get(itemRow.order_id) || [];
      list.push(mapRowToOrderItem(itemRow));
      itemsByOrderId.set(itemRow.order_id, list);
    }

    const orders = orderRows.map((r) => {
      const order = mapRowToOrder(r, itemsByOrderId.get(r.id) || []);
      ordersById.set(order.id, order);
      return order;
    });

    return orders;
  })();

  return Object.assign(cachedList, {
    then: (resolve: any, reject: any) => promise.then(resolve, reject),
    catch: (reject: any) => promise.catch(reject),
    finally: (cb: any) => promise.finally(cb),
  }) as any;
}

export function updateOrderStatusByAdmin(
  orderId: string,
  newStatus: OrderStatus
): Promise<Order> & Order {
  const cached = ordersById.get(orderId.trim());
  const fallbackOrder = cached ? { ...cached, orderStatus: newStatus } : ({} as Order);

  const promise = (async () => {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      const [rows] = await connection.query<OrderRow[]>(
        'SELECT * FROM orders WHERE id = ? FOR UPDATE',
        [orderId.trim()]
      );
      const row = rows[0];
      if (!row) {
        throw new Error(`ORDER_NOT_FOUND: Order with ID '${orderId}' not found`);
      }

      if (row.order_status === 'cancelled' && newStatus !== 'cancelled') {
        throw new Error(
          `ORDER_ALREADY_CANCELLED: Order '${row.order_number}' is already cancelled and its status cannot be changed`
        );
      }

      const [itemRows] = await connection.query<OrderItemRow[]>(
        'SELECT * FROM order_items WHERE order_id = ?',
        [row.id]
      );

      let stockRestored = Boolean(row.stock_restored);
      if (newStatus === 'cancelled' && !stockRestored) {
        for (const item of itemRows) {
          await connection.query(
            'UPDATE products SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [item.quantity, item.product_id]
          );
        }
        stockRestored = true;
      }

      const now = new Date();
      await connection.query(
        'UPDATE orders SET order_status = ?, stock_restored = ?, updated_at = ? WHERE id = ?',
        [newStatus, stockRestored ? 1 : 0, now, row.id]
      );

      await connection.commit();

      const items = itemRows.map(mapRowToOrderItem);
      const updatedOrder = mapRowToOrder(
        {
          ...row,
          order_status: newStatus,
          stock_restored: stockRestored ? 1 : 0,
          updated_at: now,
        },
        items
      );

      ordersById.set(updatedOrder.id, updatedOrder);
      return updatedOrder;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  })();

  return Object.assign(promise, fallbackOrder) as any;
}
