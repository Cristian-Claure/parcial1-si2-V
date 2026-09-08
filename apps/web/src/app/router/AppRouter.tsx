import { Route, Routes } from "react-router-dom";

function MigrationHome() {
  return (
    <main className="migration-shell">
      <section className="migration-card">
        <span className="eyebrow">VÉLORA</span>
        <h1>React + PWA</h1>
        <p>
          Nuevo frontend preparado para migración funcional por módulos.
        </p>
      </section>
    </main>
  );
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<MigrationHome />} />
    </Routes>
  );
}