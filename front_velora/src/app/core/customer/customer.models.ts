import { CustomerType } from '../auth/auth.models';

export interface CustomerProfileUpdatePayload {
  firstName: string;
  lastName: string;
  phone: string | null;
  customerType: Exclude<CustomerType, null>;
  businessName: string | null;
  taxId: string | null;
}

export interface CustomerAddress {
  id: string;
  label: string;
  recipientName: string;
  recipientPhone: string;
  department: string;
  city: string;
  zone: string | null;
  addressLine: string;
  reference: string | null;
  defaultAddress: boolean;
}

export interface CustomerAddressPayload {
  label: string;
  recipientName: string;
  recipientPhone: string;
  department: string;
  city: string;
  zone: string | null;
  addressLine: string;
  reference: string | null;
  defaultAddress: boolean;
}