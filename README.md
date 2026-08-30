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