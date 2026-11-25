export type CategoryStatus = 'Active' | 'Inactive';

export interface Category {
  id: string;
  name: string;
  description: string;
  image: string;
  productCount: number;
  status?: CategoryStatus | undefined;
}

export type CreateCategoryInput = {
  name: string;
  description?: string | undefined;
  image?: string | undefined;
  productCount?: number | undefined;
  status?: CategoryStatus | undefined;
};

export type UpdateCategoryInput = Partial<CreateCategoryInput>;

