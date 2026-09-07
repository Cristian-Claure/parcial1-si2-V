# Instalación de VÉLORA en otra PC

Esta guía prepara un entorno local de desarrollo desde un clon limpio del repositorio.

## 1. Requisitos

Instala:

- Git.
- Java JDK 21.
- PostgreSQL 17 o una versión compatible con el proyecto.
- Node.js y pnpm.
- Python 3.13.
- Android Studio con Android SDK para el módulo móvil.
- PowerShell 5.1+ o PowerShell 7.

Versiones usadas en la validación final del proyecto:

- Java 21.0.12.1.
- Spring Boot 4.1.1.
- PostgreSQL 17.11.
- Node.js 24.16.0.
- Gradle 9.5.0.
- Python 3.13.14.
- pytest 8.4.x.

## 2. Clonar el repositorio

```powershell
git clone <URL_DEL_REPOSITORIO>
cd PARCIAL_SI2_V
git status
```

## 3. Crear `.env`

```powershell
Copy-Item .env.example .env
```

Edita `.env` y completa tus valores locales. Nunca publiques `.env`.

Revisa como mínimo:

- `VELORA_DB_HOST`
- `VELORA_DB_PORT`
- `VELORA_DB_NAME`
- `VELORA_DB_USER`
- `VELORA_DB_PASSWORD`
- `VELORA_JWT_SECRET`
- `VELORA_AI_BASE_URL`
- `VELORA_AI_INTERNAL_TOKEN`
- `VELORA_CORS_ALLOWED_ORIGINS`
- credenciales Stripe si se probarán pagos;
- configuración Firebase si se probarán notificaciones;
- `REPLICATE_API_TOKEN` si se probará Replicate.

Para desarrollo web local:

```env
VELORA_CORS_ALLOWED_ORIGINS=http://localhost:4200,http://127.0.0.1:4200
```

## 4. PostgreSQL

Crea una base y un usuario según los valores definidos en `.env`.

El puerto debe coincidir con `VELORA_DB_PORT`.

Flyway aplica/valida las migraciones al iniciar el backend. En el checkpoint final existen 23 migraciones.

No uses `flyway clean` en una base con datos que quieras conservar.

## 5. Backend

Desde la raíz:

```powershell
.\scripts\load-env.ps1
cd back_velora
.\mvnw.cmd -DskipTests package
.\mvnw.cmd test
.\mvnw.cmd spring-boot:run
```

Backend local esperado:

```text
http://localhost:8080
```

## 6. Frontend Web

```powershell
cd front_velora
pnpm install
pnpm run build
```

Para desarrollo:

```powershell
cd ..
.\scripts\start-front.ps1
```

Frontend local habitual:

```text
http://localhost:4200
```

## 7. AI / FastAPI

Crear el entorno virtual:

```powershell
python -m venv ai_velora\.venv
```

Instalar runtime:

```powershell
.\ai_velora\.venv\Scripts\python.exe -m pip install --upgrade pip
.\ai_velora\.venv\Scripts\python.exe -m pip install -r ai_velora\requirements.txt
```

Instalar dependencias de pruebas:

```powershell
.\ai_velora\.venv\Scripts\python.exe -m pip install -r ai_velora\requirements-dev.txt
```

Validar:

```powershell
cd ai_velora
.\.venv\Scripts\python.exe -m compileall -q app
.\.venv\Scripts\python.exe -m pytest -q
```

Arranque desde la raíz:

```powershell
.\scripts\start-ai.ps1
```

El adaptador LOCAL es solo para desarrollo. El objetivo de producción del Probador Virtual es Replicate.

## 8. Android

Abre `mobile_velora` en Android Studio y deja que Gradle sincronice.

Validación por consola:

```powershell
cd mobile_velora
.\gradlew.bat --no-daemon :app:compileDebugKotlin
.\gradlew.bat --no-daemon :app:testDebugUnitTest
```

## 9. Orden recomendado de arranque local

1. PostgreSQL.
2. Backend.
3. AI.
4. Frontend.
5. Android si se va a probar mobile.

## 10. Producción Google Cloud

No copies la configuración local directamente a producción.

Producción debe usar configuración de runtime/Secret Manager.

Objetivo del Probador Virtual:

```env
VELORA_TRYON_PROVIDER=replicate
VELORA_CATALOG_ASSET_PROVIDER=gcs
VELORA_TRYON_RESULT_PROVIDER=gcs
```

Además configura:

- `VELORA_AI_BASE_URL`
- `VELORA_AI_INTERNAL_TOKEN`
- `VELORA_CORS_ALLOWED_ORIGINS`
- `VELORA_CATALOG_GCS_BUCKET`
- `VELORA_CATALOG_GCS_PREFIX`
- `VELORA_TRYON_RESULT_GCS_BUCKET`
- `VELORA_TRYON_RESULT_GCS_PREFIX`
- `REPLICATE_API_TOKEN`
- `VELORA_TRYON_REPLICATE_MODEL`

GCS debe autenticarse mediante Application Default Credentials/service account de runtime. No guardes service-account JSON dentro del repositorio.

## 11. Checklist de fresh clone

Valida:

```text
Backend package     PASS
Backend tests       PASS
Frontend build      PASS
Mobile compile      PASS
Mobile unit tests   PASS
AI compileall       PASS
AI tests            PASS
```

También confirma:

- `.env` ignorado por Git;
- PostgreSQL accesible;
- Flyway sin migraciones fallidas;
- ningún secreto privado versionado;
- CORS configurado para el host correcto.

## 12. Problemas comunes

### Java incorrecto

```powershell
java -version
javac -version
```

Debe usarse JDK 21.

### PostgreSQL no conecta

Revisa host, puerto, base, usuario y password en `.env`.

### Frontend no llega al backend

Revisa backend, proxy local y `VELORA_CORS_ALLOWED_ORIGINS`.

### AI no encuentra pytest

```powershell
.\ai_velora\.venv\Scripts\python.exe -m pip install -r ai_velora\requirements-dev.txt
```

### Replicate/GCS

No son necesarios para validar el flujo LOCAL. Para producción, configura sus variables y credenciales únicamente en runtime.
