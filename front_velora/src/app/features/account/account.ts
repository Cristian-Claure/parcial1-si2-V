import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { ConfirmService } from '../../core/feedback/confirm.service';
import { FeedbackService } from '../../core/feedback/feedback.service';
import { WebPushService } from '../../core/push/web-push.service';
import { Product } from '../../core/catalog/catalog.models';
import { CatalogService } from '../../core/catalog/catalog.service';
import {
  CustomerAddress,
  CustomerAddressPayload
} from '../../core/customer/customer.models';
import { CustomerService } from '../../core/customer/customer.service';
import {
  AuthenticatedShell,
  ShellNavItem
} from '../../shared/authenticated-shell/authenticated-shell';

import {
  CUSTOMER_NAV_ITEMS
} from '../../shared/customer-navigation';

type CustomerKind = 'B2C' | 'B2B';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [
    AuthenticatedShell,
    ReactiveFormsModule,
    RouterLink
  ],
  templateUrl: './account.html',
  styleUrl: './account.scss'
})
export class Account {
  readonly auth = inject(AuthService);

  private readonly catalog = inject(CatalogService);
  private readonly customer = inject(CustomerService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly confirm = inject(ConfirmService);
  private readonly feedback = inject(FeedbackService);

  readonly webPush =
    inject(WebPushService);

  readonly products = signal<Product[]>([]);
  readonly addresses = signal<CustomerAddress[]>([]);

  readonly loadingProducts = signal(true);
  readonly loadingProfile = signal(true);
  readonly loadingAddresses = signal(true);

  readonly profileSaving = signal(false);
  readonly addressSaving = signal(false);

  readonly showAddressForm = signal(false);
  readonly editingAddressId = signal<string | null>(null);

  readonly successMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  readonly navItems: ShellNavItem[] =
    CUSTOMER_NAV_ITEMS;

  readonly profileForm = this.fb.nonNullable.group({
    firstName: [
      '',
      [
        Validators.required,
        Validators.maxLength(80)
      ]
    ],
    lastName: [
      '',
      [
        Validators.required,
        Validators.maxLength(100)
      ]
    ],
    phone: [
      '',
      Validators.maxLength(40)
    ],
    customerType:
      this.fb.nonNullable.control<CustomerKind>(
        'B2C',
        Validators.required
      ),
    businessName: [
      '',
      Validators.maxLength(160)
    ],
    taxId: [
      '',
      Validators.maxLength(40)
    ]
  });

  readonly addressForm = this.fb.nonNullable.group({
    label: [
      '',
      [
        Validators.required,
        Validators.maxLength(60)
      ]
    ],
    recipientName: [
      '',
      [
        Validators.required,
        Validators.maxLength(180)
      ]
    ],
    recipientPhone: [
      '',
      [
        Validators.required,
        Validators.maxLength(40)
      ]
    ],
    department: [
      '',
      [
        Validators.required,
        Validators.maxLength(100)
      ]
    ],
    city: [
      '',
      [
        Validators.required,
        Validators.maxLength(100)
      ]
    ],
    zone: [
      '',
      Validators.maxLength(120)
    ],
    addressLine: [
      '',
      [
        Validators.required,
        Validators.maxLength(240)
      ]
    ],
    reference: [
      '',
      Validators.maxLength(300)
    ],
    defaultAddress: false
  });

  constructor() {
    this.loadProfile();
    this.loadAddresses();
    this.loadProducts();
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/']);
  }

  async enablePushNotifications():
    Promise<void> {
    const result =
      await this.webPush
        .enableNotifications();

    switch (result) {
      case 'enabled':
        this.feedback.success(
          'Notificaciones activadas',
          'Recibirás actualizaciones de tus pedidos en este navegador.'
        );
        break;

      case 'denied':
        this.feedback.warning(
          'Permiso bloqueado',
          'Puedes habilitar las notificaciones desde la configuración del navegador.'
        );
        break;

      case 'unsupported':
        this.feedback.info(
          'Notificaciones no disponibles',
          'Este navegador no admite el flujo de notificaciones de VÉLORA.'
        );
        break;

      default:
        this.feedback.error(
          'No pudimos activar las notificaciones',
          'Inténtalo nuevamente o revisa los permisos del navegador.'
        );
    }
  }

  pushButtonLabel(): string {
    switch (
      this.webPush.permissionState()
    ) {
      case 'granted':
        return this.webPush
          .installationRegistered()
          ? 'Notificaciones activadas'
          : 'Reconectar notificaciones';
      case 'denied':
        return 'Permiso bloqueado';
      case 'unsupported':
        return 'No disponible';
      default:
        return 'Activar notificaciones';
    }
  }

  userLabel(): string {
    const user = this.auth.currentUser();

    return user
      ? `${user.firstName} ${user.lastName}`
      : 'Cliente';
  }

  isBusinessCustomer(): boolean {
    return this.profileForm.controls.customerType.value === 'B2B';
  }

  saveProfile(): void {
    this.clearMessages();

    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      this.errorMessage.set(
        'Revise los campos obligatorios del perfil.'
      );
      return;
    }

    const value = this.profileForm.getRawValue();

    if (
      value.customerType === 'B2B' &&
      (
        !value.businessName.trim() ||
        !value.taxId.trim()
      )
    ) {
      this.errorMessage.set(
        'Para una cuenta B2B debe registrar razón social y NIT.'
      );
      return;
    }

    this.profileSaving.set(true);

    this.customer.updateProfile({
      firstName: value.firstName.trim(),
      lastName: value.lastName.trim(),
      phone: this.optional(value.phone),
      customerType: value.customerType,
      businessName:
        value.customerType === 'B2B'
          ? this.optional(value.businessName)
          : null,
      taxId:
        value.customerType === 'B2B'
          ? this.optional(value.taxId)
          : null
    }).subscribe({
      next: (profile) => {
        this.patchProfile(profile);

        this.auth.currentUser.set(profile);

        this.auth.refreshProfile().subscribe({
          error: () => undefined
        });

        this.profileSaving.set(false);
        this.successMessage.set(
          'Perfil actualizado correctamente.'
        );

        this.feedback.success(
          'Perfil actualizado',
          'Sus datos personales quedaron guardados correctamente.'
        );
      },
      error: (error: HttpErrorResponse) => {
        this.profileSaving.set(false);
        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible actualizar el perfil.'
          )
        );
      }
    });
  }

  newAddress(): void {
    this.clearMessages();

    const user = this.auth.currentUser();

    this.editingAddressId.set(null);

    this.addressForm.reset({
      label: '',
      recipientName: user
        ? `${user.firstName} ${user.lastName}`
        : '',
      recipientPhone: user?.phone ?? '',
      department: '',
      city: '',
      zone: '',
      addressLine: '',
      reference: '',
      defaultAddress: this.addresses().length === 0
    });

    this.showAddressForm.set(true);
  }

  editAddress(address: CustomerAddress): void {
    this.clearMessages();

    this.editingAddressId.set(address.id);

    this.addressForm.reset({
      label: address.label,
      recipientName: address.recipientName,
      recipientPhone: address.recipientPhone,
      department: address.department,
      city: address.city,
      zone: address.zone ?? '',
      addressLine: address.addressLine,
      reference: address.reference ?? '',
      defaultAddress: address.defaultAddress
    });

    this.showAddressForm.set(true);
  }

  cancelAddressEdit(): void {
    this.showAddressForm.set(false);
    this.editingAddressId.set(null);
    this.addressForm.reset();
    this.clearMessages();
  }

  saveAddress(): void {
    this.clearMessages();

    if (this.addressForm.invalid) {
      this.addressForm.markAllAsTouched();
      this.errorMessage.set(
        'Revise los campos obligatorios de la dirección.'
      );
      return;
    }

    const value = this.addressForm.getRawValue();

    const payload: CustomerAddressPayload = {
      label: value.label.trim(),
      recipientName: value.recipientName.trim(),
      recipientPhone: value.recipientPhone.trim(),
      department: value.department.trim(),
      city: value.city.trim(),
      zone: this.optional(value.zone),
      addressLine: value.addressLine.trim(),
      reference: this.optional(value.reference),
      defaultAddress: value.defaultAddress
    };

    const addressId = this.editingAddressId();

    this.addressSaving.set(true);

    const request = addressId
      ? this.customer.updateAddress(
          addressId,
          payload
        )
      : this.customer.createAddress(
          payload
        );

    request.subscribe({
      next: () => {
        this.addressSaving.set(false);
        this.showAddressForm.set(false);
        this.editingAddressId.set(null);

        this.successMessage.set(
          addressId
            ? 'Dirección actualizada correctamente.'
            : 'Dirección registrada correctamente.'
        );

        this.feedback.success(
          'Dirección guardada',
          addressId
            ? 'La dirección fue actualizada.'
            : 'La nueva dirección quedó registrada.'
        );

        this.loadAddresses();
      },
      error: (error: HttpErrorResponse) => {
        this.addressSaving.set(false);
        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible guardar la dirección.'
          )
        );
      }
    });
  }

  async deleteAddress(
    address: CustomerAddress
  ): Promise<void> {
    const confirmed =
      await this.confirm.ask({
        eyebrow: 'DIRECCIONES',
        title:
          `¿Eliminar "${address.label}"?`,
        message:
          'Esta dirección dejará de estar disponible para futuras entregas.',
        confirmLabel:
          'Eliminar dirección',
        cancelLabel:
          'Conservar dirección',
        destructive: true
      });

    if (!confirmed) {
      return;
    }

    this.clearMessages();

    this.customer.deleteAddress(
      address.id
    ).subscribe({
      next: () => {
        this.successMessage.set(
          'Dirección eliminada correctamente.'
        );

        this.feedback.success(
          'Dirección eliminada',
          'La dirección dejó de estar disponible para nuevas entregas.'
        );

        this.loadAddresses();
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible eliminar la dirección.'
          )
        );
      }
    });
  }

  lowestPrice(product: Product): number | null {
    const prices = product.variants
      .filter((variant) => variant.active)
      .map((variant) => variant.price);

    return prices.length
      ? Math.min(...prices)
      : null;
  }

  private loadProfile(): void {
    this.loadingProfile.set(true);

    this.customer.profile().subscribe({
      next: (profile) => {
        this.patchProfile(profile);
        this.auth.currentUser.set(profile);
        this.loadingProfile.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.loadingProfile.set(false);

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible cargar el perfil.'
          )
        );
      }
    });
  }

  private loadAddresses(): void {
    this.loadingAddresses.set(true);

    this.customer.addresses().subscribe({
      next: (addresses) => {
        this.addresses.set(addresses);
        this.loadingAddresses.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.loadingAddresses.set(false);

        this.errorMessage.set(
          this.readError(
            error,
            'No fue posible cargar las direcciones.'
          )
        );
      }
    });
  }

  private loadProducts(): void {
    this.catalog.publicProducts().subscribe({
      next: (products) => {
        this.products.set(products);
        this.loadingProducts.set(false);
      },
      error: () => {
        this.loadingProducts.set(false);
      }
    });
  }

  private patchProfile(
    profile: {
      firstName: string;
      lastName: string;
      phone: string | null;
      customerType: 'B2C' | 'B2B' | null;
      businessName: string | null;
      taxId: string | null;
    }
  ): void {
    this.profileForm.reset({
      firstName: profile.firstName,
      lastName: profile.lastName,
      phone: profile.phone ?? '',
      customerType: profile.customerType ?? 'B2C',
      businessName: profile.businessName ?? '',
      taxId: profile.taxId ?? ''
    });
  }

  private optional(value: string): string | null {
    const normalized = value.trim();

    return normalized.length
      ? normalized
      : null;
  }

  private clearMessages(): void {
    this.successMessage.set(null);
    this.errorMessage.set(null);
  }

  private readError(
    error: HttpErrorResponse,
    fallback: string
  ): string {
    const message = error.error?.message;

    return typeof message === 'string' &&
      message.trim().length
      ? message
      : fallback;
  }
}