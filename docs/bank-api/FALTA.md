# QR bancario real — lo que falta

Esta carpeta está **vacía de documentación oficial**. Por eso el adaptador `OPENBCB`/`BCP`
(`apps/back/src/billing/qr/bank-qr.gateway.ts`) es un **esqueleto**: tiene el contrato de la interfaz
`QrPaymentGateway`, el manejo genérico (credenciales por variables de entorno, tiempo de espera, mapeo de
errores, consulta de estado con backoff desde el servidor) y pruebas contra un servidor HTTP simulado con
un contrato de prueba propio. **No contiene ningún endpoint, campo ni esquema de autenticación del banco.**
Mientras falte la documentación, `VELORA_QR_PROVIDER=OPENBCB|BCP` deja el QR deshabilitado con el aviso
"falta la documentación oficial" y el sistema sigue funcionando con `DEMO`.

## Lo que necesito (colóquelo en esta carpeta)

1. **Documentación oficial de la API de cobro por QR** del banco o del switch elegido (PDF, colección
   Postman u OpenAPI), en su versión vigente y del ambiente de pruebas (sandbox).
2. **Autenticación**: cómo se obtiene el acceso (OAuth2, API key, certificado mTLS, firma de cada
   solicitud), duración del token y cómo se renueva.
3. **Generar QR**: endpoint, campos obligatorios (monto, moneda, glosa/referencia, vencimiento,
   cuenta destino), formato de la respuesta (cadena EMV, imagen base64, identificador del cobro) y límites
   (monto mínimo/máximo, vencimiento máximo).
4. **Consultar estado**: endpoint y valores de estado posibles, para mapearlos a
   `PENDING | PAID | FAILED | EXPIRED`.
5. **Notificación (webhook)**, si existe: formato, cómo se firma o autentica, reintentos y si exige una URL
   pública (en ese caso se documentará el túnel para local).
6. **Reembolso o anulación**, si el banco lo permite.
7. **Credenciales de sandbox** (se cargan solo en `.env`, nunca en el repositorio):
   `VELORA_QR_BASE_URL`, `VELORA_QR_CLIENT_ID`, `VELORA_QR_CLIENT_SECRET` y, si aplica,
   `VELORA_QR_WEBHOOK_SECRET`.
8. **Convenio comercial**: cuenta receptora y si el convenio es de la plataforma o de cada tienda.

## Cómo se completará

1. Escribir `BankQrApiSpec` (autorizar, crear cargo, consultar estado, reembolso y, si aplica, validar el
   webhook) **solo** con lo que diga la documentación, y registrarlo en `BANK_QR_SPECS`.
2. Repetir las pruebas del adaptador contra el sandbox del banco y agregar las del webhook.
3. Cambiar `VELORA_QR_PROVIDER` en `.env`. No cambia nada en web, móvil ni contratos.

## Limitación conocida

En un QR real **cada tienda necesitaría su propio convenio** con el banco para cobrar a su propia
cuenta. En esta demo, todo cobro QR (pedidos y planes) va a la cuenta de la plataforma.
