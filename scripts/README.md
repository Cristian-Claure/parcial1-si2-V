# Scripts

`load-env.ps1` carga las variables del archivo raíz `.env` en la sesión actual de PowerShell.

El stack vigente se ejecuta mediante los scripts pnpm definidos en `package.json`:

- `pnpm dev:api`
- `pnpm dev:web`
- `pnpm dev:mobile`
- `pnpm db:migrate:fresh`
- `pnpm build:azure:api`
- `pnpm build:azure:web`
