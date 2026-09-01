import {
  Injectable,
  signal
} from '@angular/core';

export interface ConfirmRequest {
  eyebrow: string;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
}

interface PendingConfirm {
  resolve: (value: boolean) => void;
}

@Injectable({
  providedIn: 'root'
})
export class ConfirmService {
  readonly current =
    signal<ConfirmRequest | null>(
      null
    );

  private pending:
    PendingConfirm | null = null;

  ask(
    request: Partial<ConfirmRequest> &
      Pick<
        ConfirmRequest,
        'title' | 'message'
      >
  ): Promise<boolean> {
    if (this.pending) {
      this.pending.resolve(false);
      this.pending = null;
    }

    const normalized: ConfirmRequest = {
      eyebrow:
        request.eyebrow ??
        'CONFIRMACIÓN',
      title: request.title,
      message: request.message,
      confirmLabel:
        request.confirmLabel ??
        'Confirmar',
      cancelLabel:
        request.cancelLabel ??
        'Volver',
      destructive:
        request.destructive ??
        false
    };

    this.current.set(normalized);

    return new Promise<boolean>(
      (resolve) => {
        this.pending = {
          resolve
        };
      }
    );
  }

  accept(): void {
    this.finish(true);
  }

  cancel(): void {
    this.finish(false);
  }

  private finish(
    result: boolean
  ): void {
    const current =
      this.pending;

    this.pending = null;
    this.current.set(null);

    current?.resolve(result);
  }
}