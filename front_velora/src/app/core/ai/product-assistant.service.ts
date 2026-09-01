import {
  HttpClient
} from '@angular/common/http';

import {
  Injectable,
  inject
} from '@angular/core';

import {
  ProductAssistantRequest,
  ProductAssistantResponse
} from './product-assistant.models';

@Injectable({
  providedIn: 'root'
})
export class ProductAssistantService {
  private readonly http =
    inject(HttpClient);

  recommend(
    payload: ProductAssistantRequest
  ) {
    return this.http.post<
      ProductAssistantResponse
    >(
      '/api/customer/assistant/products',
      payload
    );
  }
}