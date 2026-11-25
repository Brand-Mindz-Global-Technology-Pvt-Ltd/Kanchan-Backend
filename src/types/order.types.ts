import type { CustomerAddress } from './address.types.ts';

export type PaymentMethod = 'online' | 'cod';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

export const ORDER_STATUSES: readonly OrderStatus[] = [
  'pending',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
] as const;

export interface OrderItem {
  productId: string;
  productName: string;
  variant?: string | undefined;
  potType?: string | undefined;
  price: number; // actual purchased unit price (with offer discount applied if eligible)
  originalPrice?: number | undefined; // normal/MRP list price before offer discount
  discountPerUnit: number; // originalPrice - price (0 if no offer on this product)
  quantity: number;
  totalPrice: number; // price * quantity
  totalSavings: number; // discountPerUnit * quantity
  image: string;
}

export interface OrderProduct {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string; // Formatted summary address string
  deliveryAddress: CustomerAddress; // Complete structured address
  items: OrderItem[];
  products: OrderProduct[]; // Compatible with frontend admin/orders data structure
  itemCount: number;
  subtotal: number; // Sum of purchased item prices (backend calculated)
  totalSavings: number; // Sum of all product offer savings (backend calculated)
  deliveryFee: number; // 0 if subtotal >= 799, otherwise 99
  freeShippingThreshold: number; // 799
  totalAmount: number; // subtotal + deliveryFee
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  orderDate: string; // YYYY-MM-DD
  stockRestored: boolean; // Flag to guarantee stock is restored exactly once upon cancellation
  createdAt: string;
  updatedAt: string;
}

export interface BuyNowItemInput {
  productId: string;
  quantity?: number | undefined;
  variant?: string | undefined;
  potType?: string | undefined;
}

export interface CreateOrderInput {
  deliveryAddressId: string;
  paymentMethod?: PaymentMethod | undefined;
  buyNowItem?: BuyNowItemInput | undefined;
  items?: BuyNowItemInput[] | undefined;
  isBuyNow?: boolean | undefined;
}

export interface UpdateOrderStatusInput {
  status: OrderStatus;
}
