// Lint de la app móvil con la configuración oficial de Expo (flat config).
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  { ignores: ["dist/*", "node_modules/*", ".expo/*"] },
]);
