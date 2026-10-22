"""Servicio ML local de VELORA (Fase 4)."""
import os

# joblib consulta wmic (ausente en Windows recientes) para contar nucleos; se fija un tope modesto de RAM/CPU.
os.environ.setdefault("LOKY_MAX_CPU_COUNT", "2")
