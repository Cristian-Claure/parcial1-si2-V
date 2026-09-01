import {
  Component,
  inject
} from '@angular/core';

import {
  FeedbackService,
  FeedbackTone
} from '../../core/feedback/feedback.service';

@Component({
  selector: 'app-feedback-outlet',
  standalone: true,
  templateUrl:
    './feedback-outlet.html',
  styleUrl:
    './feedback-outlet.scss'
})
export class FeedbackOutlet {
  readonly feedback =
    inject(FeedbackService);

  icon(
    tone: FeedbackTone
  ): string {
    switch (tone) {
      case 'success':
        return '✓';
      case 'error':
        return '!';
      case 'warning':
        return '!';
      case 'info':
        return 'i';
    }
  }
}