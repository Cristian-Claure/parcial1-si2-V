import ts from "typescript";
import { defineConfig } from "vitest/config";

// esbuild no emite `design:paramtypes`; sin esos metadatos la inyección de
// dependencias de Nest no funciona. Las pruebas de integración levantan el
// AppModule real, así que se transpila con TypeScript (igual que `nest build`).
const compilerOptions = {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
  experimentalDecorators: true,
  emitDecoratorMetadata: true,
  useDefineForClassFields: false,
  sourceMap: true,
  inlineSources: true,
};

function typescriptWithDecoratorMetadata() {
  return {
    name: "velora-typescript-decorator-metadata",
    enforce: "pre",
    transform(code, id) {
      const file = id.split("?")[0];
      if (!file.endsWith(".ts") || file.endsWith(".d.ts") || file.includes("/node_modules/")) {
        return null;
      }
      const output = ts.transpileModule(code, { compilerOptions, fileName: file });
      return { code: output.outputText, map: output.sourceMapText ? JSON.parse(output.sourceMapText) : null };
    },
  };
}

export default defineConfig({
  esbuild: false,
  plugins: [typescriptWithDecoratorMetadata()],
  test: {
    include: ["src/**/*.test.ts"],
    // Las suites de integración crean su propia base temporal; se ejecutan en serie.
    fileParallelism: true,
    hookTimeout: 120_000,
    testTimeout: 60_000,
  },
});
