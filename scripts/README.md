# Scripts

`load-env.ps1` carga las variables del archivo raíz `.env` en la sesión actual de PowerShell.

El stack vigente se ejecuta mediante los scripts pnpm definidos en `package.json`:

- `pnpm dev:back`
- `pnpm dev:front`
- `pnpm dev:mobile`
- `pnpm db:migrate:fresh`
- `pnpm build:azure:back`
- `pnpm build:azure:front`

## demo-saas.mjs (Fase 1 SaaS)

Demo reproducible del examen, solo vía HTTP y sin credenciales: crea propietarios FREE, PLUS y MAX con un identificador de corrida, comprueba los rechazos `PLAN_LIMIT_*`, el aislamiento entre propietarios, la marca por empresa (`/t/:slug`), los widgets del dashboard por nivel (BASIC / STANDARD / ADVANCED) y que VÉLORA sigue respondiendo.

```powershell
pnpm dev:back                       # o el backend ya levantado
node scripts/demo-saas.mjs          # API por defecto: http://127.0.0.1:8080
$env:VELORA_DEMO_API_BASE="http://127.0.0.1:18080"; node scripts/demo-saas.mjs
```

Sale con código 1 si alguna verificación falla. Los propietarios demo usan la contraseña `DemoSaas2026` (cuentas locales de prueba).
