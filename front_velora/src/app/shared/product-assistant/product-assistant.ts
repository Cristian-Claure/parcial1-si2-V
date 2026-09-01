import {
  HttpErrorResponse
} from '@angular/common/http';

import {
  Component,
  computed,
  inject,
  signal
} from '@angular/core';

import {
  RouterLink
} from '@angular/router';

import {
  ProductAssistantHistoryItem,
  ProductAssistantRecommendation
} from '../../core/ai/product-assistant.models';

import {
  ProductAssistantService
} from '../../core/ai/product-assistant.service';

import {
  Product
} from '../../core/catalog/catalog.models';

import {
  CatalogService
} from '../../core/catalog/catalog.service';

interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ResolvedRecommendation {
  product: Product;
  reason: string;
  variantIds: string[];
}

@Component({
  selector: 'app-product-assistant',
  standalone: true,
  imports: [RouterLink],
  templateUrl:
    './product-assistant.html',
  styleUrl:
    './product-assistant.scss'
})
export class ProductAssistant {
  private readonly assistant =
    inject(ProductAssistantService);

  private readonly catalog =
    inject(CatalogService);

  readonly open = signal(false);
  readonly busy = signal(false);
  readonly input = signal('');
  readonly errorMessage =
    signal<string | null>(null);

  readonly products =
    signal<Product[]>([]);

  readonly messages =
    signal<AssistantMessage[]>([
      {
        role: 'assistant',
        content:
          'Hola. Soy VÉLORA AI. Cuénteme la ocasión, estilo, color, talla o presupuesto y buscaré únicamente dentro de nuestra colección real.'
      }
    ]);

  readonly recommendations =
    signal<ResolvedRecommendation[]>([]);

  readonly canSend = computed(
    () =>
      !this.busy() &&
      this.input().trim().length >= 2
  );

  readonly quickPrompts = [
    'Quiero un look elegante para una cena.',
    'Busco algo neutro y versátil por menos de Bs 500.',
    'Recomiéndame una opción femenina para oficina.',
    'Quiero una prenda cómoda pero sofisticada.'
  ];

  constructor() {
    this.catalog
      .publicProducts()
      .subscribe({
        next: (products) =>
          this.products.set(
            products.filter(
              (product) =>
                product.status === 'ACTIVE'
            )
          ),
        error: () => undefined
      });
  }

  toggle(): void {
    this.open.update(
      (current) => !current
    );
  }

  close(): void {
    this.open.set(false);
  }

  updateInput(
    event: Event
  ): void {
    const target =
      event.target as HTMLTextAreaElement;

    this.input.set(
      target.value
    );
  }

  usePrompt(
    prompt: string
  ): void {
    this.input.set(prompt);
    this.send();
  }

  send(): void {
    const message =
      this.input().trim();

    if (
      message.length < 2 ||
      this.busy()
    ) {
      return;
    }

    const history =
      this.toHistory(
        this.messages()
      );

    this.messages.update(
      (current) => [
        ...current,
        {
          role: 'user',
          content: message
        }
      ]
    );

    this.input.set('');
    this.errorMessage.set(null);
    this.recommendations.set([]);
    this.busy.set(true);

    this.assistant
      .recommend({
        message,
        history
      })
      .subscribe({
        next: (response) => {
          this.busy.set(false);

          this.messages.update(
            (current) => [
              ...current,
              {
                role: 'assistant',
                content: response.reply
              }
            ]
          );

          this.recommendations.set(
            this.resolveRecommendations(
              response.recommendations
            )
          );
        },

        error: (
          error: HttpErrorResponse
        ) => {
          this.busy.set(false);

          this.errorMessage.set(
            this.readError(error)
          );
        }
      });
  }

  lowestPrice(
    product: Product
  ): number | null {
    const prices =
      product.variants
        .filter(
          (variant) =>
            variant.active
        )
        .map(
          (variant) =>
            variant.price
        );

    return prices.length
      ? Math.min(...prices)
      : null;
  }

  imageUrl(
    product: Product
  ): string | null {
    const primary =
      product.images.find(
        (image) =>
          image.primary
      );

    return (
      primary?.imageUrl ??
      product.images[0]?.imageUrl ??
      null
    );
  }

  private resolveRecommendations(
    recommendations:
      ProductAssistantRecommendation[]
  ): ResolvedRecommendation[] {
    const productMap =
      new Map(
        this.products().map(
          (product) => [
            product.id,
            product
          ]
        )
      );

    return recommendations
      .map((recommendation) => {
        const product =
          productMap.get(
            recommendation.productId
          );

        if (!product) {
          return null;
        }

        const validVariants =
          new Set(
            product.variants
              .filter(
                (variant) =>
                  variant.active
              )
              .map(
                (variant) =>
                  variant.id
              )
          );

        return {
          product,
          reason:
            recommendation.reason,
          variantIds:
            recommendation.variantIds
              .filter(
                (variantId) =>
                  validVariants.has(
                    variantId
                  )
              )
        };
      })
      .filter(
        (
          value
        ): value is
          ResolvedRecommendation =>
            value !== null
      )
      .slice(0, 4);
  }

  private toHistory(
    messages: AssistantMessage[]
  ): ProductAssistantHistoryItem[] {
    return messages
      .slice(-8)
      .map(
        (message) => ({
          role: message.role,
          content:
            message.content
        })
      );
  }

  private readError(
    error: HttpErrorResponse
  ): string {
    const detail =
      error.error?.detail ??
      error.error?.message;

    if (
      typeof detail === 'string' &&
      detail.trim()
    ) {
      return detail;
    }

    if (error.status === 0) {
      return (
        'No pudimos conectar con VÉLORA AI. ' +
        'Compruebe que Backend y ai_velora estén iniciados.'
      );
    }

    if (error.status === 503) {
      return (
        'VÉLORA AI todavía no está configurado. ' +
        'Revise OPENAI_API_KEY y el token interno.'
      );
    }

    return (
      'No pude preparar una recomendación en este momento. ' +
      'Puede intentarlo nuevamente.'
    );
  }
}