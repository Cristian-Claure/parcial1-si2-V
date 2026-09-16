# Scripts

`load-env.ps1` carga las variables del archivo raíz `.env` en la sesión actual de PowerShell.

El stack vigente se ejecuta mediante los scripts pnpm definidos en `package.json`:

- `pnpm dev:back`
- `pnpm dev:front`
- `pnpm dev:mobile`
- `pnpm db:migrate:fresh`
- `pnpm build:azure:back`
- `pnpm build:azure:front`
