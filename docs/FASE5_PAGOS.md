# Fase 5 — Pagos: Stripe, QR y transferencia

> Estado (29-oct-2026): **Parte A completa** en la rama `feat/fase5-pagos`. Demo: `node scripts/demo-pagos.mjs` (25 comprobaciones).

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
payments.payment_reference  VARCHAR(24) NULL UNIQUE          -- referencia numérica (QR) o glosa TRM… (transferencia)
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
| `PlanPaymentsService`: opciones, crear pago de plan (STRIPE/QR/TRANSFER), historial, estado, comprobante de transferencia, PDF | `plan-payments/plan-payments.service.ts` |
| Revisión de transferencias y configuración de cobro | `plan-payments/platform-billing.service.ts` |

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
| GET | `/api/platform/payments?status=&method=` · POST `/:paymentId/review` (`{decision: APPROVE\|REJECT, reason}`) | PLATFORM_ADMIN |
| GET | `/api/billing/transfer-qr/:storageKey` (QR estático de la cuenta, público por diseño) | público |

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

## 5. Flujo (diagrama)

```text
 Propietario (Mi plan)                Backend                                    Proveedor
 ───────────────────                  ───────                                    ─────────
 Mejorar/renovar → método ──POST /admin/plan/payments──► payments PENDING (monto = plans.price_monthly)
   Tarjeta ─────────────────────────► Stripe Checkout (BOB) ─────────────────► checkout.stripe.com
                                       ◄─ webhook firmado ─┐   GET sesión (revalida estado, monto, moneda)
                                       ◄─ consulta PENDING ┘
   QR ──────────────────────────────► qr_charges (ref 14 díg., token HMAC, 10 min) ─► Banco demo /pagar/qr/<ref>?t=
                                       ◄─ POST /pay/qr/<ref>/confirm (token 1 uso, 403/410/429)
   Transferencia ──► comprobante ────► PENDING_REVIEW ──► /plataforma/pagos: aprobar | rechazar(motivo)
                                                                 │                 └─► PENDING (reenvía)
                                                                 ▼
                         PaymentSettlementService.markPaid (FOR UPDATE, idempotente)
                         └─► PAID ─► subscriptions: plan + 30 días (renovación suma al vencimiento) + audit_event BILLING
```

Los pedidos usan el mismo QR (`POST /api/customer/orders/:id/payments/qr`): al pagar, el pago del pedido pasa a PAID y el reporte "Cobros por método" lo cuenta como QR. Los pagos de plan nunca cuentan como ventas (los reportes unen `payments` con `orders`).

## 6. Por qué es una demo y cómo pasar al banco real

- **DEMO**: el QR codifica un enlace firmado con HMAC (`VELORA_QR_SIGNING_SECRET`) a la pantalla "Banco demo" de la propia web, que avisa "modo demostración" y no mueve dinero. Sirve para demostrar el ciclo completo (generar, vencer, pagar una sola vez, reflejarse en reportes) sin convenio bancario.
- **Banco real (OPENBCB/BCP)**: el adaptador existe como esqueleto (`billing/qr/bank-qr.gateway.ts`) y está probado contra un servidor simulado; **no se inventó ningún endpoint**. Falta la documentación oficial: ver `docs/bank-api/FALTA.md`. Con ella se escribe el `BankQrApiSpec`, se cargan `VELORA_QR_BASE_URL`, `VELORA_QR_CLIENT_ID`, `VELORA_QR_CLIENT_SECRET` (y `VELORA_QR_WEBHOOK_SECRET` si hay webhook) y se cambia `VELORA_QR_PROVIDER`. La confirmación funciona sin URL pública: cuando el cliente consulta un pago PENDING, el servidor pregunta al banco con backoff (2 s → 30 s).
- **Stripe**: modo test. El backend verifica la clave con `GET /v1/balance` (en caché 10 min); si Stripe la rechaza (p. ej. `api_key_expired`) la tarjeta aparece "no configurada". Con una clave `sk_test_…` vigente el flujo se habilita sin cambios de código.

### Listener local de Stripe (webhooks en 127.0.0.1:18080)

1. Poner una clave de prueba vigente en `STRIPE_SECRET_KEY` del `.env`.
2. `.\scripts\stripe-listener.ps1` (o `-Port 8080`): verifica la clave (solo lectura), obtiene el secreto del listener con `stripe listen --print-secret`, lo guarda como `STRIPE_WEBHOOK_SECRET` en el `.env` **sin imprimirlo**, arranca el contenedor `velora-stripe-listener-local` (`stripe/stripe-cli`, reenvía a `http://host.docker.internal:18080/api/payments/stripe/webhook`) y detiene `velora-stripe-listener-azure-v2`. La clave pasa al contenedor por un `--env-file` temporal.
3. Reiniciar solo el backend. Sin listener el flujo también funciona: al consultar un pago PENDING el servidor revalida la sesión contra Stripe.
4. `node scripts/demo-pagos.mjs` crea una sesión de Checkout para un plan y otra para un pedido **sin pagarlas** (se cancelan); la tarjeta `4242 4242 4242 4242` se prueba a mano en el navegador.

## 7. Limitaciones honestas

- En un QR real **cada tienda necesitaría su propio convenio**; en la demo todo cobro QR (pedidos y planes) va a la cuenta de la plataforma.
- El límite de intentos del Banco demo es en memoria (por proceso), igual que el de autenticación.
- El vencimiento es perezoso: un QR vencido que nadie consulta sigue PENDING en la BD hasta la siguiente lectura (los reportes solo cuentan PAID, así que no afecta cifras).
- La caja (POS) sigue registrando QR manual (confirmación del cajero); no se conectó al QR dinámico.
- `POST /api/admin/plan/change` con tarjeta DEMO se conserva para el alta de tiendas (`/crear-tienda`) y `demo-saas`; Mi plan ya no la ofrece.
- Los precios se mantienen (PLUS 99, MAX 249 Bs/mes): `plans.price_monthly` ya existía.

## 8. Pruebas

| Suite | Qué cubre |
|---|---|
| `billing/qr/qr.test.ts` | firma (monto inmutable), tiempo constante, hash, SVG/PNG válidos, referencia, backoff, límite por IP, periodo del plan |
| `billing/qr/bank-qr.gateway.test.ts` | adaptador real sin doc (503), sin credenciales, contra servidor simulado, timeout 502 |
| `qr-payments.integration.test.ts` | QR de pedido, idempotencia, 403/410/429, monto alterado, vencimiento perezoso, aislamiento, reporte con QR |
| `plan-payments.integration.test.ts` | 3 métodos, plan solo en PAID, renovación +30, auditoría, PDF, transferencia (415/413, rechazo, reenvío, aprobación), comprobante ajeno 404/403/401, Stripe con doble HTTP (monto alterado, firma inválida, idempotencia) |
| `tenant-isolation.integration.test.ts` | 8 rutas nuevas en la suite A/B |

## 9. Cómo demostrarlo en 3 minutos

1. `node scripts/demo-pagos.mjs` (25 ✔).
2. Web como cliente: Checkout → "Pagar ahora con QR" → Mis pedidos muestra el QR con cuenta regresiva → "Abrir el Banco demo" → Pagar → el pedido pasa a Pagado.
3. Propietario: Mi plan → Mejorar → elegir QR o Transferencia → (transferencia) subir comprobante.
4. Plataforma: `/plataforma/pagos` → ver el comprobante → Rechazar con motivo → el propietario lo ve y reenvía → Aprobar → el plan queda activo y aparece el PDF en el historial.
