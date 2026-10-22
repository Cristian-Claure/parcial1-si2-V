"""Calendario comercial de Bolivia usado por los modelos (el mismo que sembró el generador).

Fechas públicas, conocidas de antemano: Día del Padre (19-mar), Día de la Madre (27-may),
Black Friday (4.º viernes de noviembre), temporada navideña, quincena y fin de mes.
"""
from __future__ import annotations

import datetime as dt

import numpy as np
import pandas as pd

SPECIAL_COLUMNS = [
    "fathers_pre", "fathers_day", "mothers_pre", "mothers_day",
    "black_friday", "bf_weekend", "xmas_season", "xmas_eve", "xmas_day",
]


def black_friday(year: int) -> dt.date:
    first = dt.date(year, 11, 1)
    offset = (4 - first.weekday()) % 7  # 4 = viernes
    return first + dt.timedelta(days=offset + 21)


def calendar_flags(days: pd.DatetimeIndex) -> pd.DataFrame:
    """Variables de calendario por día (todas conocidas antes del día)."""
    month, dom = days.month.to_numpy(), days.day.to_numpy()
    days_in_month = days.days_in_month.to_numpy()
    bf = np.array([black_friday(year) for year in days.year], dtype="datetime64[D]")
    as_date = days.to_numpy().astype("datetime64[D]")
    flags = pd.DataFrame(index=days)
    flags["dow"] = days.dayofweek  # 0 = lunes
    flags["month"] = month
    flags["day_of_month"] = dom
    flags["quincena"] = ((dom >= 14) & (dom <= 16)).astype(int)
    flags["month_end"] = ((dom >= days_in_month - 1) | (dom == 1)).astype(int)
    flags["fathers_pre"] = ((month == 3) & (dom >= 16) & (dom <= 18)).astype(int)
    flags["fathers_day"] = ((month == 3) & (dom == 19)).astype(int)
    flags["mothers_pre"] = ((month == 5) & (dom >= 24) & (dom <= 26)).astype(int)
    flags["mothers_day"] = ((month == 5) & (dom == 27)).astype(int)
    flags["black_friday"] = (as_date == bf).astype(int)
    flags["bf_weekend"] = ((as_date - bf >= np.timedelta64(1, "D")) & (as_date - bf <= np.timedelta64(2, "D"))).astype(int)
    flags["xmas_season"] = ((month == 12) & (dom >= 15) & (dom <= 23)).astype(int)
    flags["xmas_eve"] = ((month == 12) & (dom == 24)).astype(int)
    flags["xmas_day"] = ((month == 12) & (dom == 25)).astype(int)
    return flags


_LABELS = {
    "black_friday": "Black Friday",
    "bf_weekend": "Fin de semana de Black Friday",
    "mothers_day": "Día de la Madre",
    "mothers_pre": "Previa del Día de la Madre",
    "fathers_day": "Día del Padre",
    "fathers_pre": "Previa del Día del Padre",
    "xmas_eve": "Nochebuena",
    "xmas_day": "Navidad (tiendas con poca venta)",
    "xmas_season": "Temporada navideña",
    "quincena": "Quincena (días 14 a 16)",
    "month_end": "Fin de mes / inicio de mes",
}


def explain(day: pd.Timestamp) -> str | None:
    """Explicación de calendario para un día (la más específica primero)."""
    row = calendar_flags(pd.DatetimeIndex([day])).iloc[0]
    for column in ["black_friday", "bf_weekend", "mothers_day", "mothers_pre", "fathers_day", "fathers_pre", "xmas_eve", "xmas_day", "xmas_season", "quincena", "month_end"]:
        if row[column]:
            return _LABELS[column]
    return None


# Fechas especiales sembradas con efecto fuerte (para medir la recuperación de U2).
SEEDED_STRONG = ["black_friday", "mothers_day", "fathers_day", "xmas_eve", "xmas_day"]
