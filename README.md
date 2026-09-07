# VÉLORA

VÉLORA es una plataforma omnicanal para una boutique de moda femenina de Santa Cruz de la Sierra, Bolivia. El proyecto integra comercio electrónico, operación por sucursal, inventario por almacén, pagos, experiencia CUSTOMER web/móvil, reportes con IA, notificaciones y un Probador Virtual preparado para producción en Google Cloud.

## Estado del proyecto

El desarrollo funcional y el hardening técnico previo al despliegue están cerrados en la rama `test/cycle7-integrated-tests`.

Validación integrada final aprobada el 7 de septiembre de 2026:

- Backend Java/Spring Boot: PASS.
- PostgreSQL + Flyway: PASS, 23 migraciones validadas.
- Frontend Angular production build: PASS.
- Android/Kotlin compile + unit tests: PASS.
- Servicio AI Python/FastAPI: PASS, 6 tests.
- Seguridad/performance: PASS.
- Bitácora/auditoría: PASS.
- Cloud Try-On + GCS hardening: PASS.
- Git/secret scan/production boundary: PASS.

El despliegue real a Google Cloud todavía no se ejecuta en este checkpoint.

## Arquitectura

El repositorio es un monorepo formado por aplicaciones independientes:

- `back_velora`: API REST, autenticación, negocio, inventario, pedidos, pagos, auditoría y orquestación del Probador Virtual.
- `front_velora`: aplicación Angular/PWA para CUSTOMER, ADMIN y STORE_MANAGER.
- `mobile_velora`: aplicación Android nativa con Kotlin y Jetpack Compose.
- `ai_velora`: servicio FastAPI para funciones de IA y Virtual Try-On.
- `scripts`: automatización de entorno y arranque local.
- `docs`: documentación técnica y académica del proyecto.

Flujo principal:

`Web / Android -> Backend Spring Boot -> PostgreSQL`

Para IA:

`Web / Android -> Backend -> AI FastAPI`

En producción del Probador Virtual:

`Backend / AI -> Replicate`

Persistencia de imágenes de catálogo y resultados de Try-On en producción:

`Backend -> Google Cloud Storage`

## Stack validado

### Backend

- Java 21.
- Spring Boot 4.1.1.
- Spring Security.
- Spring Data JPA.
- PostgreSQL 17.
- Flyway.
- Maven Wrapper.

### Frontend

- Angular.
- TypeScript.
- SCSS.
- PWA.
- IndexedDB.
- pnpm.
- Build validado con Node.js 24.16.0.

### Android

- Kotlin.
- Jetpack Compose.
- Gradle Wrapper 9.5.0.
- Firebase Cloud Messaging.

### AI

- Python 3.13.
- FastAPI.
- Replicate como proveedor cloud del Probador Virtual.
- pytest para pruebas del servicio.

## Roles

- `ADMIN`: administración global y creación de encargados.
- `STORE_MANAGER`: operación de su sucursal según permisos.
- `CUSTOMER`: navegación, carrito, checkout, pedidos y experiencia de compra.

## Inventario y PICKUP

El stock comercial se obtiene directamente del inventario de `Warehouse`; `Store` no mantiene una segunda capa duplicada de stock.

Para `PICKUP`:

- se usa únicamente el Warehouse principal/default de la tienda seleccionada;
- la tienda debe poder cubrir el carrito completo;
- no se agregan existencias de Warehouses secundarios;
- no existe pickup multi-tienda;
- el carrito normal no reserva stock de forma prolongada.

## Funcionalidades principales

- autenticación y registro CUSTOMER;
- administración de usuarios y encargados;
- catálogo, categorías, productos y variantes;
- inventario por Warehouse;
- carrito y checkout;
- pedidos y PICKUP;
- pagos online;
- POS y operación administrativa;
- favoritos;
- notificaciones;
- PWA;
- experiencia Android;
- reportes y analítica con IA;
- interacción por voz;
- bitácora/auditoría administrativa;
- Probador Virtual;
- almacenamiento cloud preparado para GCS.

## Probador Virtual

El benchmark vigente contempla únicamente:

- `LOCAL`: adaptador de desarrollo;
- `REPLICATE`: proveedor cloud y objetivo de producción.

FASHN no forma parte del alcance actual.

Reglas de producción:

- el cliente no selecciona el proveedor;
- el proveedor se configura en servidor;
- la foto de la persona es transitoria y VÉLORA no la persiste;
- imágenes de catálogo y resultados se preparan para Google Cloud Storage;
- autenticación GCS mediante ADC/service account de runtime;
- no se deben versionar archivos JSON de service account;
- tokens de Replicate y otros secretos se inyectan por entorno/Secret Manager.

## Seguridad

- autenticación JWT;
- sesiones backend stateless;
- rate limiting configurable;
- soporte de proxy headers;
- CORS configurable mediante `VELORA_CORS_ALLOWED_ORIGINS`;
- localhost queda únicamente como default de desarrollo;
- `.env` está ignorado por Git;
- no se detectaron credenciales privadas rastreadas en el checkpoint final.

## Bitácora y auditoría

La bitácora incluye:

- entidad y repositorio de eventos;
- servicio paginado;
- captura de mutaciones;
- API administrativa de consulta;
- interfaz web para ADMIN;
- persistencia mediante migración Flyway.

## Configuración

Copia `.env.example` a `.env` y completa los valores locales necesarios.

Nunca subas `.env`, passwords, tokens, API keys, credenciales Stripe, credenciales de Firebase privadas, tokens de Replicate ni service-account JSON.

Variables relevantes para producción cloud:

- `VELORA_AI_BASE_URL`
- `VELORA_AI_INTERNAL_TOKEN`
- `VELORA_CORS_ALLOWED_ORIGINS`
- `VELORA_CATALOG_ASSET_PROVIDER`
- `VELORA_CATALOG_GCS_BUCKET`
- `VELORA_CATALOG_GCS_PREFIX`
- `VELORA_TRYON_PROVIDER`
- `REPLICATE_API_TOKEN`
- `VELORA_TRYON_REPLICATE_MODEL`
- `VELORA_TRYON_RESULT_PROVIDER`
- `VELORA_TRYON_RESULT_GCS_BUCKET`
- `VELORA_TRYON_RESULT_GCS_PREFIX`
- `VELORA_JWT_SECRET`

## Ejecución local

Consulta [INSTALLATION.md](INSTALLATION.md) para preparar una PC nueva, configurar PostgreSQL, instalar dependencias, arrancar cada módulo y ejecutar las pruebas.

## Validaciones principales

Backend:

```powershell
cd back_velora
.\mvnw.cmd test
```

Frontend:

```powershell
cd front_velora
pnpm install
pnpm run build
```

Android:

```powershell
cd mobile_velora
.\gradlew.bat :app:compileDebugKotlin
.\gradlew.bat :app:testDebugUnitTest
```

AI:

```powershell
.\ai_velora\.venv\Scripts\python.exe -m pip install -r ai_velora\requirements.txt
.\ai_velora\.venv\Scripts\python.exe -m pip install -r ai_velora\requirements-dev.txt
cd ai_velora
.\.venv\Scripts\python.exe -m pytest -q
```

## Despliegue

Objetivo de producción: Google Cloud.

El despliegue se realizará después del cierre documental, checkpoint GitHub y tareas adicionales solicitadas antes de publicar producción.

## Documentación

`Punto 14` corresponde al cierre documental y no se presenta como una fase de implementación del producto.
