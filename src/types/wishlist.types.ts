export type WishlistBadgeVariant = 'green' | 'amber' | 'sage';

export interface WishlistItem {
  productId: string;
  name: string;
  badge?: string | undefined;
  badgeVariant?: WishlistBadgeVariant | undefined;
  description: string;
  price: number;
  originalPrice: number;
  image: string;
  isFavorite: boolean;
  addedAt: string;
}

export interface CustomerWishlist {
  customerId: string;
  items: WishlistItem[];
  count: number;
  updatedAt: string;
}

export type AddToWishlistInput = {
  customerId?: string | undefined;
  productId: string;
};

