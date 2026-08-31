import {
  FulfillmentType,
  OrderStatus
} from '../order/order.models';

import {
  Payment
} from '../payment/payment.models';

export type OrderChannel =
  | 'ECOMMERCE'
  | 'POS';

export interface OperationalOrder {
  id: string;
  orderNumber: string;

  customerId: string | null;
  customerName: string;
  customerEmail: string | null;

  storeId: string;
  storeName: string;

  warehouseId: string;
  warehouseName: string;

  orderChannel: OrderChannel;
  fulfillmentType: FulfillmentType;
  status: OrderStatus;

  currency: string;
  total: number;

  createdAt: string;
  fulfilledAt: string | null;
  cancelledAt: string | null;

  payments: Payment[];
}