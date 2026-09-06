# VÉLORA

Plataforma omnicanal de comercio electrónico orientada a una cadena de moda femenina en Santa Cruz de la Sierra, Bolivia.

## Arquitectura

El proyecto se organiza como un monorepo compuesto por aplicaciones independientes:

- `back_velora`: API y lógica de negocio desarrollada con Java y Spring Boot.
- `front_velora`: aplicación web desarrollada con Angular y capacidades PWA.
- `mobile_velora`: aplicación Android nativa desarrollada con Kotlin.
- `ai_velora`: servicio de inteligencia artificial desarrollado con Python y FastAPI.
- `docs`: documentación del proyecto, PUDS, UML 2.5 y diseño de datos.
- `infra`: infraestructura y configuración Docker.
- `scripts`: scripts de automatización y desarrollo.

## Stack principal

### Backend
- Java 21 LTS
- Spring Boot
- Spring Security
- Spring Data JPA
- PostgreSQL
- Flyway
- Maven Wrapper

### Frontend
- Angular
- TypeScript
- SCSS
- PWA
- IndexedDB

### Mobile
- Kotlin
- Jetpack Compose
- CameraX
- MediaPipe
- ARCore

### Inteligencia Artificial
- Python
- FastAPI
- Speech-to-Text
- LLM
- Motor de consultas analíticas

### Infraestructura
- Docker Desktop
- Docker Compose
- PostgreSQL

## Roles

- ADMIN
- STORE_MANAGER
- CUSTOMER

Los clientes pueden clasificarse como:

- B2C
- B2B

## Tiendas iniciales

- VÉLORA Equipetrol
- VÉLORA Urubó
- VÉLORA Zona Norte

## Estado actual — cierre del Punto 12

Al 6 de septiembre de 2026, VÉLORA tiene cerrada la implementación funcional planificada de Web, PWA, Mobile, Backend e IA hasta el Punto 12. Fuera de correcciones que puedan surgir durante la estabilización, no quedan nuevas funcionalidades de producto pendientes antes de las pruebas integradas y la documentación final.

### Estado del roadmap

| Punto | Alcance | Estado |
| --- | --- | --- |
| 1 | CUSTOMER Offline Backend | ✅ Cerrado |
| 2 | Web + PWA CUSTOMER Offline | ✅ Cerrado |
| 3 | Mobile CUSTOMER Offline | ✅ Cerrado |
| 4 | UX/UI CUSTOMER Web + Mobile | ✅ Cerrado |
| 5 | Feedback premium, toasts y errores | ✅ Cerrado |
| 6 | Pagos online y arquitectura Stripe | ✅ Cerrado |
| 7 | Asistente IA de productos | ✅ Cerrado |
| 8 | Reportes dinámicos con IA | ✅ Cerrado |
| 9 | Reportes por voz | ✅ Cerrado |
| 10 | Notificaciones push FCM Mobile | ✅ Cerrado |
| 11 | Probador virtual | ✅ Cerrado |
| 12 | Auditoría, seguridad, performance y limpieza final | ✅ Cerrado |
| 13 | Pruebas integradas | ⏳ Pendiente |
| 14 | Documentación final PUDS | ⏳ Pendiente |

La implementación funcional está cerrada en **12 de 14 puntos**. El siguiente bloque de ingeniería es el **Punto 13 — pruebas integradas**; después se completará la documentación PUDS y la preparación del despliegue final.

### Capacidades funcionales implementadas

- Autenticación y registro con JWT y control de acceso por roles `ADMIN`, `STORE_MANAGER` y `CUSTOMER`.
- Administración de sucursales, usuarios/encargados, catálogo, variantes, inventario, almacenes, POS y cajas.
- Catálogo público, favoritos, carrito, checkout, pedidos y experiencia CUSTOMER.
- Stock web consumido desde inventario de almacén, sin capa duplicada de stock por sucursal.
- PICKUP validado exclusivamente contra el almacén principal/default de la sucursal seleccionada.
- Flujo de pagos con tarjeta mediante Stripe y soporte de QR.
- Operación CUSTOMER offline en Web/PWA y Android, con sincronización posterior.
- Notificaciones push en Android mediante Firebase Cloud Messaging.
- Asistente IA de productos integrado con backend.
- Reportes operativos dinámicos, consultas con IA, narrativa de hallazgos y reportes por voz.
- Probador virtual con pipeline de assets de catálogo, proveedor `LOCAL` para desarrollo y `Replicate` como proveedor externo evaluado.
- Navegación por rol depurada, sin placeholders funcionales falsos ni rutas de navegación pendientes.

### Backend y datos

- Java 21 + Spring Boot.
- PostgreSQL + Flyway, actualmente en **V22**.
- Spring Security con JWT stateless y autorización por rol.
- Auditoría transversal de mutaciones de negocio con consulta administrativa y filtros.
- Historial de estados de pago preservado como bitácora especializada.
- Rate limiting para autenticación y endpoints costosos.
- Validación de uploads por tamaño, tipo y firma real en los flujos sensibles.
- Verificación de firma de webhooks de Stripe.
- Token interno para la comunicación Backend ↔ servicio IA.
- Índices y consultas optimizadas para órdenes, reportes y operaciones pesadas.

### Frontend Web / PWA

- Angular + TypeScript + SCSS.
- PWA con Service Worker e IndexedDB.
- UX CUSTOMER para catálogo, favoritos, bolsa/carrito, checkout, pedidos, cuenta y probador virtual.
- Áreas operativas para ADMIN y STORE_MANAGER.
- Reportes IA y auditoría disponibles desde navegación administrativa.
- Carga lazy de rutas relevantes y optimización de imágenes.
- Navegación final sin elementos deshabilitados ni rutas huérfanas.

### Aplicación Android

- Kotlin + Jetpack Compose.
- Experiencia CUSTOMER con navegación principal para Home, Catálogo, Favoritos, Carrito y Cuenta.
- Login, registro y persistencia de sesión.
- Catálogo, carrito, checkout y pedidos.
- Operación offline CUSTOMER.
- Notificaciones push mediante FCM.
- Integración funcional alineada con el backend y los flujos Web/PWA.

### Inteligencia Artificial

- Servicio Python + FastAPI.
- Asistente de productos.
- Motor de reportes analíticos y narrativa IA.
- Flujo de reportes por voz.
- Probador virtual desacoplado por proveedores.
- Benchmark actual del probador virtual limitado a `LOCAL` y `Replicate`; FASHN no forma parte del alcance vigente.

### Punto 12 — cierre técnico

El Punto 12 quedó dividido y cerrado en cinco frentes:

- **P12A — Auditoría:** bitácora transversal, actor, fecha/hora, categoría, entidad/ruta y consulta ADMIN.
- **P12B — Seguridad:** JWT sin secreto de desarrollo por defecto, rate limiting, revisión de roles/endpoints, Stripe, uploads, IA interna y FCM.
- **P12C — Performance:** índices Flyway V22, reducción de consultas pesadas en memoria, filtros ejecutados en base de datos, lazy loading y optimización de imágenes.
- **P12D — Configuración ADMIN:** se eliminó el placeholder de “Configuración”; no se creó una pantalla ficticia porque la configuración técnica real se gestiona mediante entorno/backend.
- **P12E — Navegación final:** `NAV_DISABLED=0` y `UNRESOLVED_NAV_ROUTES=0`; se eliminaron placeholders obsoletos.

### Pendiente antes del despliegue final

1. Ejecutar **Punto 13 — pruebas integradas** sobre autenticación, roles, catálogo, inventario, carrito, checkout, Stripe/QR, pedidos, offline, favoritos, FCM, IA, voz, probador virtual y permisos.
2. Corregir únicamente regresiones o defectos encontrados durante las pruebas.
3. Completar **Punto 14 — documentación PUDS**.
4. Preparar y validar el despliegue en Google Cloud, incluyendo configuración productiva de secretos, CORS, almacenamiento y componentes que deban escalarse.

> Nota de despliegue: el rate limiter actual es adecuado para la ejecución de una sola instancia; si el backend se escala horizontalmente deberá migrarse a una solución compartida o de gateway. Las configuraciones productivas y secretos no deben almacenarse en el repositorio.
