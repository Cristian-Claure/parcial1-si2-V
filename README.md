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

## Estado

Proyecto en desarrollo.

## Estado actual — Ciclo 1

El primer ciclo de VÉLORA establece la base operativa e integrada de la plataforma omnicanal.

### Backend

- Spring Boot 4.1.1 y Java 21.
- PostgreSQL 17.
- Flyway con migraciones V1–V5.
- Autenticación JWT.
- Roles ADMIN, STORE_MANAGER y CUSTOMER.
- Gestión de sucursales.
- Catálogo global de productos, categorías y variantes.
- Inventario por almacén y sucursal.
- Control de stock físico, comprometido y disponible.
- Movimientos de inventario auditables.
- Control de concurrencia del stock.

### Frontend web

- Angular 22.
- Home pública VÉLORA.
- Catálogo público conectado al backend.
- Login y registro.
- Área CUSTOMER.
- Dashboard ADMIN.
- Dashboard STORE_MANAGER.
- Gestión de catálogo.
- Gestión de inventario.
- Navegación autenticada por rol.
- Cierre de sesión.
- Base PWA con manifest y Service Worker.

### Aplicación Android

- Kotlin y Jetpack Compose.
- Aplicación orientada principalmente al CUSTOMER.
- Login y registro.
- Persistencia de sesión.
- Cierre de sesión.
- Catálogo conectado al backend.
- Visualización de productos, variantes y precios.
- Base para notificaciones push con Firebase Cloud Messaging.
- Permiso de notificaciones y canal VÉLORA.
- Gradle Wrapper 9.5.0.

### Validación del ciclo

- Backend: Maven tests aprobados.
- Frontend: build de producción aprobado.
- Android: assembleDebug aprobado.
- PostgreSQL y Flyway validados.
- Código fuente validado en UTF-8.

Las operaciones comerciales completas, pedidos, pagos, POS y sincronización offline se desarrollarán en el siguiente ciclo. Las funcionalidades de IA, reportes dinámicos por texto y voz y probador virtual se desarrollarán posteriormente.