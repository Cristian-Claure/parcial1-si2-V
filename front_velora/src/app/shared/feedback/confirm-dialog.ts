import {
  Component,
  inject
} from '@angular/core';

import {
  ConfirmService
} from '../../core/feedback/confirm.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  templateUrl:
    './confirm-dialog.html',
  styleUrl:
    './confirm-dialog.scss'
})
export class ConfirmDialog {
  readonly confirm =
    inject(ConfirmService);
}