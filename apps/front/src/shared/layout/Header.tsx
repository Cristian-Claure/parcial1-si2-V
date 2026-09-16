import { Link } from "react-router-dom";
import { Logo } from "../brand";

export function Header() {
  return (
    <header>
      <Link to="/">
        <Logo />
      </Link>

      <nav>
        <Link to="/">Inicio</Link>
        <Link to="/catalogo">CatÃ¡logo</Link>
      </nav>

      <div>
        <Link to="/carrito">ðŸ›’</Link>
        <button aria-label="Notificaciones">
          ðŸ””
        </button>
      </div>
    </header>
  );
}
