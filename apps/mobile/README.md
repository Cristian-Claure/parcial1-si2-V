# VÉLORA Mobile · React Native + Expo

Aplicación móvil CUSTOMER del monorepo VÉLORA.

## Stack

- React Native 0.86
- Expo SDK 57
- Expo Router
- TanStack Query
- Zustand
- Expo SecureStore para la sesión
- Expo SQLite para caché y cola offline
- NetInfo para conectividad
- `@velora/contracts` como contratos compartidos

## Alcance N7

- Login y registro CUSTOMER.
- Restauración segura de sesión.
- Selección explícita de Company cuando existe más de una.
- Home, catálogo, detalle y variantes.
- Favoritos.
- Bolsa.
- Checkout DELIVERY/PICKUP.
- Perfil y direcciones.
- Pedidos y pagos.
- Stripe Checkout mediante navegador seguro.
- Caché offline y cola de pedidos con idempotencia.
- Estados offline `PENDING`, `SYNCING` y `CONFLICT`.
- Sincronización al recuperar conexión.

La bolsa no reserva inventario. Un pedido offline tampoco reserva inventario ni
crea pagos hasta que el backend lo sincroniza correctamente.

PICKUP usa únicamente una Store cuyo `default_warehouse` pueda cubrir la bolsa
completa; esa elegibilidad la decide el backend autoritativo.

## Configuración local

El valor por defecto para Android Emulator es:

```text
http://10.0.2.2:8080
```

Puede sobrescribirse mediante:

```text
EXPO_PUBLIC_API_BASE_URL
EXPO_PUBLIC_STOREFRONT_COMPANY_ID
```

`EXPO_PUBLIC_STOREFRONT_COMPANY_ID` puede quedar vacío. Si existe una sola
Company activa, la aplicación la selecciona automáticamente. Con varias
Companies y sin configuración previa, el cliente debe escoger explícitamente.

## Ejecutar

Desde la raíz del monorepo:

```powershell
pnpm install --frozen-lockfile
pnpm build:packages
pnpm --filter @velora/mobile typecheck
pnpm --filter @velora/mobile start
```

Validación de bundle Android:

```powershell
pnpm --filter @velora/mobile validate:bundle
```

## Fases posteriores

- POS: N8.
- Virtual Try-On + IA + Azure Blob: N9.
- Reports + Audit: N10.
- Integración cloud/plataforma, CI/CD y Azure: N11.
