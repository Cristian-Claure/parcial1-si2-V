import { Location } from '@angular/common';

import {
  Component,
  EventEmitter,
  Input,
  Output,
  inject
} from '@angular/core';

import {
  RouterLink,
  RouterLinkActive
} from '@angular/router';

export interface ShellNavItem {
  label: string;
  route?: string;
  disabled?: boolean;
}

@Component({
  selector: 'app-authenticated-shell',
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive
  ],
  templateUrl: './authenticated-shell.html',
  styleUrl: './authenticated-shell.scss'
})
export class AuthenticatedShell {
  private readonly location =
    inject(Location);

  @Input() title = '';
  @Input() subtitle = '';
  @Input() navItems: ShellNavItem[] = [];
  @Input() userLabel = '';

  @Output()
  logoutRequested =
    new EventEmitter<void>();

  goBack(): void {
    this.location.back();
  }
}