# Fase 2 · Guía de demostración offline (3 minutos)

Requisitos: backend local corriendo (`pnpm dev:back`) y web (`pnpm dev:front`). Para la parte móvil, la app en el emulador o en Expo Go.

## A. Demo automática (30 s)

```powershell
pnpm build:packages
node scripts/demo-offline.mjs
# Si el backend no está en el puerto 8080: $env:VELORA_DEMO_API_BASE="http://127.0.0.1:18080"
```

Crea una tienda FREE con su encargado, simula un dispositivo sin red y verifica, en 17 pasos:

- cola sin red sin gastar intentos;
- sincronización completa al reconectar, con el stock inicial aplicado por el servidor;
- idempotencia (DUPLICATE);
- conflictos de documento y SKU, con "usar el existente" y "ajustar y reintentar";
- versión (VERSION_MISMATCH → "conservar el mío");
- límite del plan (REJECTED `PLAN_LIMIT_PRODUCTS`);
- tombstones en el pull;
- vinculación del cliente al registrarse.

## B. Web (DevTools → Offline), 1 min 30 s

1. Inicia sesión como **encargado** (o propietario) y abre **Sincronización** en el menú. El indicador lateral dice "Al día" y el primer pull ya guardó categorías y almacenes.
2. En DevTools → pestaña *Network*, marca **Offline**. El indicador cambia a **Sin conexión**.
3. Abre **Registro sin conexión**:
   - registra un **cliente** (nombre, teléfono y documento);
   - registra un **producto** (categoría, una variante con SKU nuevo y stock inicial en el almacén; opcionalmente una foto).

   Ambos aparecen en las tablas como **Pendiente** y el indicador muestra "2 en cola".
4. Registra otro cliente con **el mismo documento** que uno existente; quedará en la cola.
5. Desmarca **Offline**. En segundos (o con "Sincronizar ahora") se envía la cola:
   - el cliente y el producto pasan a "Sincronizado" y la foto se sube después del producto;
   - el duplicado aparece en el **Centro de sincronización** como **Conflicto · DOCUMENT_TAKEN**, con "Usar el existente", "Ajustar y reintentar" y "Descartar". Resuélvelo con "Ajustar y reintentar" y otro documento.
6. Opcional: con *Offline* activo, recarga **/catalogo**. El shell y la lectura del catálogo vienen del service worker (requiere el build de producción: `pnpm --filter @velora/front build` y `pnpm --filter @velora/front preview`).

## C. Móvil (emulador), 1 min

1. Inicia sesión con el **encargado** de la demo (`scripts/demo-offline.mjs` imprime el correo; contraseña `DemoOffline2026`). Entra al **Modo operaciones**.
2. Activa el **modo avión**. La cabecera muestra **Sin conexión**.
3. **Cliente** → registra uno. **Producto** → registra uno con stock inicial. La cabecera indica "2 en cola".
4. Desactiva el modo avión. La app sincroniza sola al recuperar la red; en **Sincronizar** la cola queda vacía y en la web el cliente y el producto ya existen.
