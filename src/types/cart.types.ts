export interface CartItem {
  productId: string;
  name: string;
  variant?: string | undefined;
  potType?: string | undefined;
  price: number;
  originalPrice?: number | undefined;
  quantity: number;
  image: string;
  itemSubtotal: number;
  itemSavings: number;
}

export interface CartSummary {
  customerId: string;
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  totalSavings: number;
  deliveryFee: number;
  isFreeShipping: boolean;
  freeShippingThreshold: number;
  totalPayable: number;
  updatedAt: string;
}

export type AddToCartInput = {
  customerId?: string | undefined;
  productId: string;
  quantity?: number | undefined;
  variant?: string | undefined;
  potType?: string | undefined;
};

export type UpdateCartItemInput = {
  customerId?: string | undefined;
  productId?: string | undefined;
  quantity: number;
  variant?: string | undefined;
  potType?: string | undefined;
};

