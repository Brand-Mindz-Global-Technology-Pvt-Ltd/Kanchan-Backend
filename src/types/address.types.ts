export type AddressTag = 'HOME' | 'WORK';

export interface CustomerAddress {
  id: string;
  customerId: string;
  name: string;
  phone: string;
  pincode: string;
  flatBuilding: string;
  streetColony: string;
  landmark?: string | undefined;
  tag: AddressTag;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAddressInput {
  name: string;
  phone: string;
  pincode: string;
  flatBuilding: string;
  streetColony: string;
  landmark?: string | undefined;
  tag: AddressTag;
  isDefault?: boolean | undefined;
}

export interface UpdateAddressInput {
  name?: string | undefined;
  phone?: string | undefined;
  pincode?: string | undefined;
  flatBuilding?: string | undefined;
  streetColony?: string | undefined;
  landmark?: string | undefined;
  tag?: AddressTag | undefined;
  isDefault?: boolean | undefined;
}

