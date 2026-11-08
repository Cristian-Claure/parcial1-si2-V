"""Crea un ZIP con rutas "/" (zipfile) para despliegues en App Service Linux.

python zipdir.py <raiz> <salida.zip> --include RUTA [RUTA ...] [--exclude-dir NOMBRE ...] [--extra ORIGEN=DESTINO ...]
Las rutas de --include son relativas a <raiz> (archivos o carpetas).
"""
from __future__ import annotations

import argparse
import os
import zipfile

ALWAYS_SKIP_DIRS = {"node_modules", ".git", "__pycache__", ".pytest_cache", ".venv", ".turbo", ".expo"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("root")
    parser.add_argument("output")
    parser.add_argument("--include", nargs="+", required=True)
    parser.add_argument("--exclude-dir", nargs="*", default=[])
    parser.add_argument("--extra", nargs="*", default=[])
    args = parser.parse_args()
    skip = ALWAYS_SKIP_DIRS | set(args.exclude_dir)
    root = os.path.abspath(args.root)
    count = 0
    with zipfile.ZipFile(args.output, "w", zipfile.ZIP_DEFLATED) as archive:
        def add(path: str, arcname: str) -> None:
            nonlocal count
            name = os.path.basename(path)
            if name.startswith(".env") and not name.endswith(".example"):
                return  # nunca se empaquetan secretos
            archive.write(path, arcname.replace(os.sep, "/"))
            count += 1

        for item in args.include:
            source = os.path.join(root, item)
            if os.path.isfile(source):
                add(source, item)
                continue
            for current, dirs, files in os.walk(source):
                rel_dir = os.path.relpath(current, root).replace(os.sep, "/")
                # Nombres sueltos excluyen la carpeta en cualquier nivel; rutas con "/" solo esa ruta.
                dirs[:] = [d for d in dirs if d not in skip and f"{rel_dir}/{d}".lstrip("./") not in skip]
                for file in files:
                    full = os.path.join(current, file)
                    add(full, os.path.relpath(full, root))
        for pair in args.extra:
            source, target = pair.split("=", 1)
            add(source, target)
    print(f"{args.output}: {count} archivos")


if __name__ == "__main__":
    main()
