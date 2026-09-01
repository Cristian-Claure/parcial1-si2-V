import {
  Injectable,
  signal
} from '@angular/core';

export type FeedbackTone =
  | 'success'
  | 'error'
  | 'warning'
  | 'info';

export interface FeedbackToast {
  id: number;
  tone: FeedbackTone;
  title: string;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class FeedbackService {
  readonly toasts =
    signal<FeedbackToast[]>([]);

  private nextId = 1;

  success(
    title: string,
    message: string,
    durationMs = 3800
  ): void {
    this.show(
      'success',
      title,
      message,
      durationMs
    );
  }

  error(
    title: string,
    message: string,
    durationMs = 6500
  ): void {
    this.show(
      'error',
      title,
      message,
      durationMs
    );
  }

  warning(
    title: string,
    message: string,
    durationMs = 5200
  ): void {
    this.show(
      'warning',
      title,
      message,
      durationMs
    );
  }

  info(
    title: string,
    message: string,
    durationMs = 4300
  ): void {
    this.show(
      'info',
      title,
      message,
      durationMs
    );
  }

  dismiss(id: number): void {
    this.toasts.update(
      (current) =>
        current.filter(
          (toast) =>
            toast.id !== id
        )
    );
  }

  private show(
    tone: FeedbackTone,
    title: string,
    message: string,
    durationMs: number
  ): void {
    const normalizedTitle =
      title.trim();

    const normalizedMessage =
      message.trim();

    if (
      !normalizedTitle ||
      !normalizedMessage
    ) {
      return;
    }

    const duplicate =
      this.toasts().find(
        (toast) =>
          toast.tone === tone &&
          toast.title ===
            normalizedTitle &&
          toast.message ===
            normalizedMessage
      );

    if (duplicate) {
      return;
    }

    const toast: FeedbackToast = {
      id: this.nextId++,
      tone,
      title: normalizedTitle,
      message: normalizedMessage
    };

    this.toasts.update(
      (current) =>
        [...current, toast]
          .slice(-4)
    );

    if (durationMs > 0) {
      globalThis.setTimeout(
        () =>
          this.dismiss(toast.id),
        durationMs
      );
    }
  }
}