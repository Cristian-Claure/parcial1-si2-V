import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

import { UserProfile } from '../auth/auth.models';
import {
  CustomerAddress,
  CustomerAddressPayload,
  CustomerProfileUpdatePayload
} from './customer.models';

@Injectable({ providedIn: 'root' })
export class CustomerService {
  private readonly http = inject(HttpClient);

  profile() {
    return this.http.get<UserProfile>(
      '/api/customer/profile'
    );
  }

  updateProfile(
    payload: CustomerProfileUpdatePayload
  ) {
    return this.http.put<UserProfile>(
      '/api/customer/profile',
      payload
    );
  }

  addresses() {
    return this.http.get<CustomerAddress[]>(
      '/api/customer/addresses'
    );
  }

  createAddress(
    payload: CustomerAddressPayload
  ) {
    return this.http.post<CustomerAddress>(
      '/api/customer/addresses',
      payload
    );
  }

  updateAddress(
    addressId: string,
    payload: CustomerAddressPayload
  ) {
    return this.http.put<CustomerAddress>(
      `/api/customer/addresses/${addressId}`,
      payload
    );
  }

  deleteAddress(
    addressId: string
  ) {
    return this.http.delete<void>(
      `/api/customer/addresses/${addressId}`
    );
  }
}