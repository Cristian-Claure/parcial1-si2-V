# Fase 5 — Pagos: Stripe, QR y transferencia

> Estado: **en curso** (rama `feat/fase5-pagos`). Este documento se escribe primero como plan y se completa al cerrar la fase.

## 0. Punto de partida (auditoría)

| Pieza | Estado en `main` | Qué cambia |
|---|---|---|
| `payments` | `order_id` XOR `subscription_id` (V30). `method ∈ {COD, CASH, CARD, WEB, QR}`, `status ∈ {PENDING, PAID, FAILED, CANCELLED, REFUNDED}`. | Se agregan `TRANSFER` (método) y `PENDING_REVIEW`, `EXPIRED` (estados), más `plan_id` y `payment_reference` para los pagos de plan. |
| Método QR en pedidos | Existe en contratos, BD y reportes, pero solo como "registrar método": un operador lo confirma a mano. | El cliente puede generar un QR real (DEMO firmado) que se confirma solo. La ruta antigua sigue funcionando. |
| `plans.price_monthly` | **Ya existe** (FREE 0, PLUS 99, MAX 249 Bs). | No se cambia: el pedido indicaba agregarlo solo si faltaba. |
| `PaymentGateway` | Interfaz con `DemoPaymentGateway` (tarjeta DEMO) y `StripePaymentGateway` (sin cobro de suscripciones). | Se agrega `QrPaymentGateway` (DEMO, OPENBCB, BCP) y el cobro de planes por Stripe Checkout. |
| Cambio de plan | `POST /api/admin/plan/change` con tarjeta DEMO (se conserva para onboarding y `demo-saas`). | La UI de Mi plan usa el flujo nuevo de 3 métodos; el plan cambia solo cuando el pago llega a `PAID`. |

## 1. Esquema — `V35__payments_qr_transfer.sql`

```sql
-- payments: métodos y estados nuevos, destino del pago de plan y glosa
ck_payments_method  += 'TRANSFER'
ck_payments_status  += 'PENDING_REVIEW', 'EXPIRED'      (y en payment_status_history)
payments.plan_id            UUID NULL REFERENCES plans(id)   -- plan comprado (solo pagos de suscripción)
payments.payment_reference  VARCHAR(24) NULL UNIQUE          -- referencia numérica (QR) o glosa (transferencia)
ck_payments_plan_target: plan_id IS NULL OR subscription_id IS NOT NULL

qr_charges (id, payment_id UNIQUE, provider DEMO|OPENBCB|BCP, reference UNIQUE,
            amount, currency, token_hash, expires_at, consumed_at, provider_charge_id,
            poll_attempts, next_poll_at, created_at, updated_at)
platform_billing_settings (id=1, bank_name, account_holder, account_type, account_number,
            tax_id, instructions, qr_storage_key, is_sample, updated_by, updated_at)
            -- semilla rotulada "DATOS DE EJEMPLO — reemplazar"
payment_transfer_proofs (id, payment_id, storage_key, content_type, size_bytes,
            operation_number, submitted_by, submitted_at, decision NULL|APPROVED|REJECTED,
            reviewed_by, reviewed_at, rejection_reason)
```

- El plan se activa **solo** en la transición a `PAID`, dentro de la misma transacción (`FOR UPDATE` sobre el pago, idempotente: un pago `PAID` no vuelve a activar). Se registra un `audit_event`.
- Periodo de 30 días. Si se renueva el **mismo** plan vigente, el nuevo vencimiento se suma desde el vencimiento actual; si se cambia de plan, el periodo empieza al pagar.
- Se mantienen la prueba de 14 días y la regla de downgrade (409 `PLAN_DOWNGRADE_EXCEEDS`).

## 2. Backend

| Pieza | Archivo |
|---|---|
| Interfaz `QrPaymentGateway` + `DemoQrGateway` (HMAC con `VELORA_QR_SIGNING_SECRET`, reembolso simulado) | `billing/qr/*.ts` |
| `BankQrGateway` (OPENBCB/BCP): **esqueleto**; las rutas y campos se inyectan desde la documentación oficial (`docs/bank-api/`). Sin ella responde 503 `QR_PROVIDER_NOT_READY`. Prueba contra un servidor HTTP simulado. | `billing/qr/bank-qr.gateway.ts` |
| Generación de QR (SVG para web, PNG en data URL para móvil) con `qrcode-generator` (sin dependencias) y PNG propio con `zlib` | `billing/qr/qr-image.ts` |
| `QrChargeService`: crear cargo, vencimiento perezoso (10 min → `EXPIRED`), consulta de estado con backoff para el proveedor real, confirmación/cancelación con token de un solo uso (hash SHA-256, `timingSafeEqual`), límite de intentos por IP | `billing/qr-charge.service.ts` |
| `PaymentSettlementService`: transición a `PAID` y efectos (activar plan) en un solo lugar, usado por QR, Stripe y transferencia | `billing/payment-settlement.service.ts` |
| `PlanPaymentsService`: opciones, crear pago de plan (STRIPE/QR/TRANSFER), historial, estado, comprobante de transferencia, PDF | `billing/plan-payments.service.ts` |
| Revisión de transferencias y configuración de cobro | `billing/platform-billing.service.ts` |

### Endpoints nuevos

| Método | Ruta | Rol |
|---|---|---|
| GET | `/api/admin/plan/payment-options` | ADMIN |
| POST | `/api/admin/plan/payments` (`{planCode, method: STRIPE\|QR\|TRANSFER}`) | ADMIN |
| GET | `/api/admin/plan/payments` · `/:paymentId` | ADMIN |
| POST | `/api/admin/plan/payments/:paymentId/transfer-proof` (multipart, ≤ 5 MB, PNG/JPG/WEBP/PDF por firma) | ADMIN |
| POST | `/api/admin/plan/payments/:paymentId/cancel` | ADMIN |
| GET | `/api/admin/plan/payments/:paymentId/receipt` (PDF, solo `PAID`) | ADMIN |
| GET | `/api/billing/payments/:paymentId/proof` | ADMIN (dueño) o PLATFORM_ADMIN |
| POST | `/api/customer/orders/:orderId/payments/qr` | CUSTOMER |
| GET | `/api/customer/payments/:paymentId/qr` | CUSTOMER |
| GET | `/api/pay/qr/:reference?t=` · POST `/confirm` · POST `/cancel` | público (token) |
| GET/PUT | `/api/platform/billing-settings` · POST/DELETE `/qr-image` | PLATFORM_ADMIN |
| GET | `/api/platform/payments` · POST `/:paymentId/approve` · `/:paymentId/reject` | PLATFORM_ADMIN |

Stripe: el pago de plan crea una sesión de Checkout en BOB con el monto del servidor. Se confirma por el webhook firmado (que ahora revalida la sesión contra la API de Stripe antes de activar un plan) **o** cuando el propietario consulta el pago `PENDING` (consulta de la sesión), así funciona en local sin URL pública. Sin `STRIPE_SECRET_KEY` válida el método aparece deshabilitado ("no configurado").

## 3. Web y móvil

- `QrPaymentPanel` (QR, cuenta regresiva, estados, banner de demostración) — reutilizado en Mis pedidos y Mi plan.
- Mi plan: elegir plan → método (Tarjeta, QR, Transferencia) → resultado; historial de pagos con PDF.
- `/pagar/qr/:ref?t=` "Banco demo" (estilo Trama, aviso de modo demostración, Pagar / Cancelar).
- `/plataforma/cobros` (datos de cobro) y `/plataforma/pagos` (cola de revisión con vista previa).
- Móvil: QR (imagen PNG data URL) en checkout y en pedidos pendientes; estado del plan sin cambios de flujo.

## 4. Bloques y commits

1. Plan (este documento).
2. Esquema V35 + contratos aditivos.
3. Backend QR (gateway DEMO, imagen, servicio, endpoints públicos y de cliente) + pruebas.
4. Backend planes (Stripe, QR, transferencia, PDF, plataforma) + A/B + pruebas.
5. Adaptador bancario esqueleto + servidor simulado + `docs/bank-api/FALTA.md`.
6. Web (panel QR, Mi plan, Banco demo, plataforma).
7. Móvil (QR en checkout y pedidos).
8. `scripts/demo-pagos.mjs` + documentación final.
