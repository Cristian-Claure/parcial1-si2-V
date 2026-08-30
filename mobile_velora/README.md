# VÉLORA Mobile · Vertical 1

Base nativa Android creada manualmente con Kotlin + Jetpack Compose.

Incluye:
- Login de cliente.
- Registro de cliente.
- Token guardado en SharedPreferences para la primera vertical.
- Rechazo de cuentas ADMIN/STORE_MANAGER en la app orientada a clientes.
- Pantalla inicial de cuenta.
- Backend local por `http://10.0.2.2:8080/api`.

## Abrir

1. Abrir la carpeta `mobile_velora` con Android Studio.
2. Usar JDK 17 para Gradle.
3. Instalar SDK 37.
4. Sincronizar Gradle.
5. Ejecutar un emulador.
6. Mantener Spring Boot en `localhost:8080` del PC.

`10.0.2.2` es la dirección del host desde el emulador Android.

No se utilizaron plantillas de interfaz para las pantallas de autenticación.
