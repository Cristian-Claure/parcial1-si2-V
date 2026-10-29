import type { CompanyResponse } from "@velora/contracts";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

function CompanyMark({ company }: { company: CompanyResponse }) {
  const name = company.brand?.name ?? company.displayName ?? company.name;
  return company.brand?.logoUrl
    ? <img className="switcher-logo" src={company.brand.logoUrl} alt="" />
    : <span className="switcher-logo switcher-monogram" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>;
}

const nameOf = (company: CompanyResponse) => company.brand?.name ?? company.displayName ?? company.name;

/**
 * Selector de empresa del propietario con logo (P3 · UX_AUDIT). Patrón listbox: Enter/Espacio o ↓ abre,
 * ↑/↓ mueven, Inicio/Fin saltan, Enter elige y Escape cierra devolviendo el foco al botón.
 */
export function CompanySwitcher({ companies, value, onChange }: { companies: CompanyResponse[]; value: string | null; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const current = companies.find((company) => company.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    list.current?.focus();
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const show = () => { setActive(Math.max(0, companies.findIndex((company) => company.id === value))); setOpen(true); };
  const choose = (index: number) => { const company = companies[index]; setOpen(false); button.current?.focus(); if (company && company.id !== value) onChange(company.id); };
  const onButtonKey = (event: KeyboardEvent) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); show(); } };
  const onListKey = (event: KeyboardEvent) => {
    const last = companies.length - 1;
    const moves: Record<string, number> = { ArrowDown: Math.min(last, active + 1), ArrowUp: Math.max(0, active - 1), Home: 0, End: last };
    if (event.key in moves) { event.preventDefault(); setActive(moves[event.key]!); return; }
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(active); return; }
    if (event.key === "Escape" || event.key === "Tab") { setOpen(false); if (event.key === "Escape") button.current?.focus(); }
  };

  return <div className="company-switcher" ref={root}>
    <span className="switcher-label" id={`${listId}-label`}>Empresa</span>
    <button ref={button} type="button" className="switcher-button" aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${listId}-label ${listId}-value`} onClick={() => (open ? setOpen(false) : show())} onKeyDown={onButtonKey}>
      {current ? <CompanyMark company={current} /> : null}
      <span id={`${listId}-value`} className="switcher-name">{current ? nameOf(current) : "Elige una empresa"}</span>
      <span className="switcher-caret" aria-hidden="true">▾</span>
    </button>
    {open ? <ul ref={list} id={listId} role="listbox" tabIndex={-1} className="switcher-list" aria-labelledby={`${listId}-label`} aria-activedescendant={`${listId}-${active}`} onKeyDown={onListKey}>
      {companies.map((company, index) => <li key={company.id} id={`${listId}-${index}`} role="option" aria-selected={company.id === value}
        className={["switcher-option", index === active ? "active" : "", company.id === value ? "selected" : ""].join(" ").trim()}
        onMouseEnter={() => setActive(index)} onClick={() => choose(index)}>
        <CompanyMark company={company} /><span>{nameOf(company)}</span>
      </li>)}
    </ul> : null}
  </div>;
}
