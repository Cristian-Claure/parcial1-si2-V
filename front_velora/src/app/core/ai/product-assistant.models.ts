export interface ProductAssistantHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface ProductAssistantRequest {
  message: string;
  history: ProductAssistantHistoryItem[];
}

export interface ProductAssistantRecommendation {
  productId: string;
  reason: string;
  variantIds: string[];
}

export interface ProductAssistantResponse {
  reply: string;
  recommendations:
    ProductAssistantRecommendation[];
  model: string;
}