export interface Product {
  id: string;
  name: string;
  subtitle: string;
  badge?: string | undefined;
  badgeBg?: string | undefined;
  originalPrice: string;
  price: string;
  priceNumeric: number;
  rating: number;
  image: string;
  images?: string[] | undefined;
  category: string;
  light: string;
  stock: number;
  description: string;
}

export type CreateProductInput = {
  name: string;
  subtitle?: string | undefined;
  badge?: string | undefined;
  badgeBg?: string | undefined;
  originalPrice?: string | undefined;
  price: string;
  priceNumeric?: number | undefined;
  rating?: number | undefined;
  image?: string | undefined;
  images?: string[] | undefined;
  category: string;
  light?: string | undefined;
  stock?: number | undefined;
  description?: string | undefined;
};

export type UpdateProductInput = Partial<CreateProductInput>;

export const PRODUCT_CATEGORIES = [
  'Tropical',
  'Low Light',
  'Air Purifying',
  'Flowering',
  'Succulents',
  'Outdoor',
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];
