import math
from collections import Counter, defaultdict
from typing import Any, Optional

import numpy as np
import pandas as pd

from app.models.schemas import (
    ChartInsight,
    ChartKpi,
    ChartRequest,
    ChartResponse,
)
from app.services.session_store import ParsedSheetData, ParsedWorkbookSession


BLUE_PALETTE = [
    "#1d5b90",
    "#4a82b5",
    "#72a4cf",
    "#aec3d3",
    "#c9dceb",
    "#123b61",
    "#56748d",
]

MONTH_NAMES_ES = {
    1: "Ene",
    2: "Feb",
    3: "Mar",
    4: "Abr",
    5: "May",
    6: "Jun",
    7: "Jul",
    8: "Ago",
    9: "Sep",
    10: "Oct",
    11: "Nov",
    12: "Dic",
}


def _format_number(val: float) -> str:
    if abs(val - round(val)) < 1e-6:
        return f"{int(round(val))}"
    return f"{val:.1f}"


def _format_pct(part: int, total: int) -> str:
    if total <= 0:
        return "0 %"
    pct = (part / total) * 100.0
    if abs(pct - round(pct)) < 0.05:
        return f"{int(round(pct))} %"
    return f"{pct:.1f} %"


def _nice_step(raw_step: float) -> float:
    if raw_step <= 0:
        return 1.0
    exp = math.floor(math.log10(raw_step))
    frac = raw_step / (10**exp)
    if frac <= 1:
        nice_frac = 1
    elif frac <= 2:
        nice_frac = 2
    elif frac <= 2.5:
        nice_frac = 2.5
    elif frac <= 5:
        nice_frac = 5
    else:
        nice_frac = 10
    return nice_frac * (10**exp)


def _bin_numeric_values(
    values: list[float], target_bins: int = 5
) -> list[tuple[str, int]]:
    if not values:
        return []

    vmin = min(values)
    vmax = max(values)

    if math.isclose(vmin, vmax):
        return [(_format_number(vmin), len(values))]

    all_ints = all(float(v).is_integer() for v in values)

    if all_ints:
        span = vmax - vmin
        step = max(1, int(math.ceil(_nice_step(span / target_bins))))
        start = int(math.floor(vmin / step) * step)
        bins: list[tuple[int, int]] = []
        cur = start
        while cur <= vmax and len(bins) < 8:
            high = cur + step - 1
            bins.append((cur, high))
            cur += step
        if bins and vmax > bins[-1][1]:
            bins[-1] = (bins[-1][0], int(math.ceil(vmax)))

        counts = [0] * len(bins)
        for v in values:
            iv = int(round(v))
            placed = False
            for idx, (lo, hi) in enumerate(bins):
                if lo <= iv <= hi:
                    counts[idx] += 1
                    placed = True
                    break
            if not placed:
                counts[-1] += 1

        result = [
            (f"{lo}–{hi}" if lo != hi else f"{lo}", cnt)
            for (lo, hi), cnt in zip(bins, counts)
            if cnt > 0 or len(bins) <= 6
        ]
        # Trim leading/trailing empty bins while keeping contiguous interior
        while result and result[0][1] == 0:
            result.pop(0)
        while result and result[-1][1] == 0:
            result.pop()
        return result

    # Float values
    edges = np.linspace(vmin, vmax, num=target_bins + 1)
    counts = [0] * target_bins
    for v in values:
        placed = False
        for i in range(target_bins):
            is_last = i == target_bins - 1
            if (edges[i] <= v < edges[i + 1]) or (is_last and v <= edges[i + 1]):
                counts[i] += 1
                placed = True
                break
        if not placed:
            counts[-1] += 1

    return [
        (f"{edges[i]:.1f}–{edges[i + 1]:.1f}", counts[i])
        for i in range(target_bins)
        if counts[i] > 0
    ]


class ChartEngine:
    """Motor dinámico de KPIs, agregaciones y series listas para Recharts."""

    def generate_chart(
        self, session: ParsedWorkbookSession, req: ChartRequest
    ) -> ChartResponse:
        sheet = session.sheets.get(req.sheet_name)
        if sheet is None:
            raise ValueError(f"La hoja '{req.sheet_name}' no existe en el archivo.")

        if req.column not in sheet.columns_meta:
            raise ValueError(
                f"La columna '{req.column}' no existe en la hoja '{req.sheet_name}'."
            )

        meta = sheet.columns_meta[req.column]
        col_type = meta["inferred_type"]
        raw_series = sheet.cleaned_columns[req.column]
        warnings: list[str] = list(sheet.warnings)

        if meta.get("excluded_non_numeric_count", 0) > 0:
            warnings.append(
                f"Se excluyeron {meta['excluded_non_numeric_count']} valores de texto no numéricos en '{req.column}'."
            )
        if meta.get("note") and meta.get("excluded_non_numeric_count", 0) == 0:
            if col_type in ("text_id", "compound_ratio"):
                warnings.append(meta["note"])

        # Multi-sheet comparison bar chart if requested
        if (
            req.chart_type == "bar"
            and req.compare_sheets
            and len(req.compare_sheets) >= 2
        ):
            return self._build_multi_sheet_bar(session, req, warnings)

        # Two-variable bar chart if secondary numeric column is provided
        if (
            req.chart_type == "bar"
            and req.secondary_column
            and req.secondary_column in sheet.columns_meta
        ):
            return self._build_two_variable_bar(sheet, req, warnings)

        if req.chart_type == "pie":
            return self._build_pie_chart(sheet, meta, raw_series, warnings)
        if req.chart_type == "bar":
            return self._build_bar_chart(sheet, meta, raw_series, warnings)
        if req.chart_type == "line":
            return self._build_line_chart(sheet, meta, raw_series, warnings)

        raise ValueError(f"Tipo de gráfico no soportado: {req.chart_type}")

    def _build_kpis(
        self,
        meta: dict[str, Any],
        values: list[Any],
        buckets: list[tuple[str, int]],
        total_rows: int,
    ) -> list[ChartKpi]:
        col_type = meta["inferred_type"]
        valid_vals = [v for v in values if v is not None]
        valid_count = len(valid_vals)
        fill_rate = meta["fill_rate"]

        top_name = buckets[0][0] if buckets else "—"
        top_count = buckets[0][1] if buckets else 0
        if buckets:
            best_bucket = max(buckets, key=lambda x: x[1])
            top_name, top_count = best_bucket

        if col_type == "numeric":
            nums = [float(v) for v in valid_vals]
            avg_str = _format_number(sum(nums) / len(nums)) if nums else "—"
            range_str = (
                f"{_format_number(min(nums))} – {_format_number(max(nums))}"
                if nums
                else "—"
            )
            excluded = meta.get("excluded_non_numeric_count", 0)
            valid_detail = (
                f"{fill_rate} % válidos ({excluded} excluidos)"
                if excluded > 0
                else f"{fill_rate} % de completitud"
            )
            return [
                ChartKpi(
                    label="Registros válidos",
                    value=str(valid_count),
                    detail=valid_detail,
                ),
                ChartKpi(
                    label="Promedio",
                    value=avg_str,
                    detail="Entre registros numéricos",
                ),
                ChartKpi(
                    label="Rango (Mín – Máx)",
                    value=range_str,
                    detail=f"De {total_rows} filas detectadas",
                ),
                ChartKpi(
                    label="Grupo predominante",
                    value=top_name,
                    detail=f"{top_count} registros · {_format_pct(top_count, valid_count)}",
                ),
            ]

        if col_type == "date":
            dates = sorted(valid_vals)
            if dates:
                period_str = (
                    f"{dates[0].strftime('%d/%m/%Y')} – {dates[-1].strftime('%d/%m/%Y')}"
                )
            else:
                period_str = "—"
            avg_per_period = (
                _format_number(valid_count / len(buckets)) if buckets else "0"
            )
            return [
                ChartKpi(
                    label="Registros con fecha",
                    value=str(valid_count),
                    detail=f"{fill_rate} % de completitud",
                ),
                ChartKpi(
                    label="Periodo analizado",
                    value=period_str,
                    detail="Rango cronológico",
                ),
                ChartKpi(
                    label="Pico máximo",
                    value=top_name,
                    detail=f"{top_count} registros · {_format_pct(top_count, valid_count)}",
                ),
                ChartKpi(
                    label="Promedio por periodo",
                    value=avg_per_period,
                    detail=f"En {len(buckets)} periodos",
                ),
            ]

        # categorical, compound_ratio, text_id
        return [
            ChartKpi(
                label="Registros válidos",
                value=str(valid_count),
                detail=f"De {total_rows} filas en la hoja",
            ),
            ChartKpi(
                label="Categorías detectadas",
                value=str(meta["unique_count"]),
                detail="Valores únicos normalizados",
            ),
            ChartKpi(
                label="Categoría predominante",
                value=top_name,
                detail=f"{top_count} registros · {_format_pct(top_count, valid_count)}",
            ),
            ChartKpi(
                label="Completitud de datos",
                value=f"{fill_rate} %",
                detail=f"{meta['null_count']} celdas vacías o nulas",
            ),
        ]

    def _build_pie_chart(
        self,
        sheet: ParsedSheetData,
        meta: dict[str, Any],
        raw_series: list[Any],
        warnings: list[str],
    ) -> ChartResponse:
        col_name = meta["name"]
        col_type = meta["inferred_type"]
        valid_vals = [v for v in raw_series if v is not None]
        total_valid = len(valid_vals)

        if col_type == "numeric":
            buckets = _bin_numeric_values([float(v) for v in valid_vals], target_bins=5)
        elif col_type == "date":
            buckets = self._group_dates(valid_vals, max_slices=7)
        else:
            counts = Counter(str(v) for v in valid_vals)
            sorted_counts = counts.most_common()
            if len(sorted_counts) > 7:
                top_6 = sorted_counts[:6]
                others_sum = sum(cnt for _, cnt in sorted_counts[6:])
                buckets = [*top_6, ("Otros", others_sum)]
                warnings.append(
                    f"Se agruparon {len(sorted_counts) - 6} categorías minoritarias en 'Otros' para mantener la legibilidad."
                )
            else:
                buckets = sorted_counts

        if not buckets:
            buckets = [("Sin datos", 0)]

        max_val = max((cnt for _, cnt in buckets), default=0)
        # Order colors: largest or highlighted first gets #1d5b90, rest cycle blue shades
        data = []
        for idx, (label, cnt) in enumerate(buckets):
            is_top = cnt == max_val and cnt > 0
            color = BLUE_PALETTE[idx % len(BLUE_PALETTE)]
            data.append(
                {
                    "name": label,
                    "value": cnt,
                    "percentage": _format_pct(cnt, total_valid),
                    "color": color,
                    "highlight": is_top,
                }
            )

        top_label, top_count = max(buckets, key=lambda x: x[1])
        kpis = self._build_kpis(meta, raw_series, buckets, len(sheet.raw_rows))

        return ChartResponse(
            chart_type="pie",
            title=f"Distribución de {col_name} — {sheet.sheet_name}",
            subtitle=f"Análisis dinámico basado en {total_valid} registros válidos.",
            kpis=kpis,
            data=data,
            x_label=col_name,
            y_label="Registros",
            insight=ChartInsight(
                headline=f"'{top_label}' concentra la mayor proporción de registros.",
                detail=(
                    f"Representa el {_format_pct(top_count, total_valid)} del total ({top_count} de {total_valid}). "
                    "Los gráficos describen los datos cargados; no constituyen una recomendación clínica."
                ),
            ),
            warnings=warnings,
        )

    def _build_bar_chart(
        self,
        sheet: ParsedSheetData,
        meta: dict[str, Any],
        raw_series: list[Any],
        warnings: list[str],
    ) -> ChartResponse:
        col_name = meta["name"]
        col_type = meta["inferred_type"]
        valid_vals = [v for v in raw_series if v is not None]
        total_valid = len(valid_vals)

        if col_type == "numeric":
            buckets = _bin_numeric_values([float(v) for v in valid_vals], target_bins=6)
            x_label = f"Rango de {col_name}"
        elif col_type == "date":
            buckets = self._group_dates(valid_vals, max_slices=12)
            x_label = f"Periodo ({col_name})"
        else:
            counts = Counter(str(v) for v in valid_vals)
            buckets = counts.most_common(12)
            if len(counts) > 12:
                warnings.append(
                    f"Se muestran las 12 categorías más frecuentes de {len(counts)} detectadas."
                )
            x_label = col_name

        if not buckets:
            buckets = [("Sin datos", 0)]

        max_val = max((cnt for _, cnt in buckets), default=0)
        data = []
        for label, cnt in buckets:
            is_top = cnt == max_val and cnt > 0
            data.append(
                {
                    "name": label,
                    "value": cnt,
                    "percentage": _format_pct(cnt, total_valid),
                    "color": "#1d5b90" if is_top else "#72a4cf",
                    "highlight": is_top,
                }
            )

        top_label, top_count = max(buckets, key=lambda x: x[1])
        kpis = self._build_kpis(meta, raw_series, buckets, len(sheet.raw_rows))

        return ChartResponse(
            chart_type="bar",
            title=f"Registros por {col_name} — {sheet.sheet_name}",
            subtitle=f"Número de registros válidos ({total_valid}) distribuidos por {col_name}.",
            kpis=kpis,
            data=data,
            x_label=x_label,
            y_label="Registros",
            insight=ChartInsight(
                headline=f"El grupo '{top_label}' registra la frecuencia más alta.",
                detail=(
                    f"Concentra {top_count} de {total_valid} registros ({_format_pct(top_count, total_valid)}). "
                    "Los gráficos describen los datos cargados; no constituyen una recomendación clínica."
                ),
            ),
            warnings=warnings,
        )

    def _build_two_variable_bar(
        self,
        sheet: ParsedSheetData,
        req: ChartRequest,
        warnings: list[str],
    ) -> ChartResponse:
        x_col = req.column
        y_col = req.secondary_column
        assert y_col is not None

        x_meta = sheet.columns_meta[x_col]
        y_meta = sheet.columns_meta[y_col]
        x_vals = sheet.cleaned_columns[x_col]
        y_vals = sheet.cleaned_columns[y_col]

        grouped: dict[str, list[float]] = defaultdict(list)
        for xv, yv in zip(x_vals, y_vals):
            if xv is None or yv is None:
                continue
            try:
                num_y = float(yv)
            except (TypeError, ValueError):
                continue
            label = xv.strftime("%Y-%m") if hasattr(xv, "strftime") else str(xv)
            grouped[label].append(num_y)

        agg = req.aggregation
        items: list[tuple[str, float, int]] = []
        for label, nums in grouped.items():
            if agg == "sum":
                val = round(sum(nums), 1)
            elif agg == "count":
                val = float(len(nums))
            else:
                val = round(sum(nums) / len(nums), 1)
            items.append((label, val, len(nums)))

        items.sort(key=lambda t: t[1], reverse=True)
        items = items[:12]

        max_val = max((t[1] for t in items), default=0.0)
        data = [
            {
                "name": label,
                "value": val,
                "count": cnt,
                "color": "#1d5b90" if val == max_val and val > 0 else "#72a4cf",
                "highlight": val == max_val and val > 0,
            }
            for label, val, cnt in items
        ]

        total_pairs = sum(t[2] for t in items)
        top_label, top_val, top_cnt = items[0] if items else ("—", 0.0, 0)
        agg_label = {"avg": "Promedio", "sum": "Suma", "count": "Conteo"}[agg]

        kpis = [
            ChartKpi(label="Pares válidos", value=str(total_pairs), detail=f"{x_col} vs {y_col}"),
            ChartKpi(label="Categorías X", value=str(len(items)), detail=x_meta["inferred_type"]),
            ChartKpi(label=f"{agg_label} máximo", value=_format_number(top_val), detail=f"En '{top_label}' ({top_cnt} reg.)"),
            ChartKpi(label="Métrica Y", value=y_col, detail=f"Tipo {y_meta['inferred_type']}"),
        ]

        return ChartResponse(
            chart_type="bar",
            title=f"{agg_label} de {y_col} por {x_col} — {sheet.sheet_name}",
            subtitle=f"Cruce dinámico de variables basado en {total_pairs} registros emparejados.",
            kpis=kpis,
            data=data,
            x_label=x_col,
            y_label=f"{agg_label} ({y_col})",
            insight=ChartInsight(
                headline=f"'{top_label}' presenta el valor más alto de {y_col} ({_format_number(top_val)}).",
                detail="Cruce descriptivo calculado automáticamente sin filtros clínicos adicionales.",
            ),
            warnings=warnings,
        )

    def _build_multi_sheet_bar(
        self,
        session: ParsedWorkbookSession,
        req: ChartRequest,
        warnings: list[str],
    ) -> ChartResponse:
        col = req.column
        compare_sheets = req.compare_sheets or []
        data = []
        total_records = 0

        for s_name in compare_sheets:
            s_obj = session.sheets.get(s_name)
            if not s_obj or col not in s_obj.columns_meta:
                continue
            s_meta = s_obj.columns_meta[col]
            valid = [v for v in s_obj.cleaned_columns[col] if v is not None]
            total_records += len(valid)
            if s_meta["inferred_type"] == "numeric" and valid:
                metric = round(sum(float(v) for v in valid) / len(valid), 1)
                y_label = f"Promedio de {col}"
            else:
                metric = len(valid)
                y_label = "Registros válidos"
            data.append({"name": s_name, "value": metric, "count": len(valid)})

        max_val = max((d["value"] for d in data), default=0)
        for d in data:
            is_top = d["value"] == max_val and d["value"] > 0
            d["highlight"] = is_top
            d["color"] = "#1d5b90" if is_top else "#72a4cf"

        top_item = max(data, key=lambda d: d["value"]) if data else {"name": "—", "value": 0}
        kpis = [
            ChartKpi(label="Hojas comparadas", value=str(len(data)), detail="Comparación multi-hoja"),
            ChartKpi(label="Registros válidos", value=str(total_records), detail=f"Columna {col}"),
            ChartKpi(label="Hoja destacada", value=str(top_item["name"]), detail=f"Valor: {top_item['value']}"),
            ChartKpi(label="Variable analizada", value=col, detail="Métrica comparativa"),
        ]

        return ChartResponse(
            chart_type="bar",
            title=f"Comparativa entre hojas: {col}",
            subtitle=f"Comparación automática de {col} en {len(data)} hojas seleccionadas.",
            kpis=kpis,
            data=data,
            x_label="Hoja",
            y_label=y_label if data else "Valor",
            insight=ChartInsight(
                headline=f"La hoja '{top_item['name']}' obtiene el mayor valor ({top_item['value']}).",
                detail="Comparación descriptiva entre las hojas seleccionadas.",
            ),
            warnings=warnings,
        )

    def _build_line_chart(
        self,
        sheet: ParsedSheetData,
        meta: dict[str, Any],
        raw_series: list[Any],
        warnings: list[str],
    ) -> ChartResponse:
        col_name = meta["name"]
        col_type = meta["inferred_type"]
        valid_vals = [v for v in raw_series if v is not None]
        total_valid = len(valid_vals)

        if col_type == "date":
            buckets = self._group_dates(valid_vals, max_slices=None)
            x_label = f"Periodo ({col_name})"
            y_label = "Registros"
        elif col_type == "numeric":
            warnings.append(
                f"'{col_name}' no es una columna de fecha; se muestra la serie ordenada por registro."
            )
            nums = [float(v) for v in valid_vals]
            # Limit points if very large so chart stays responsive
            if len(nums) > 40:
                step = math.ceil(len(nums) / 40)
                buckets = [
                    (f"Reg {i + 1}", round(sum(nums[i : i + step]) / len(nums[i : i + step]), 1))
                    for i in range(0, len(nums), step)
                ]
            else:
                buckets = [(f"#{i + 1}", round(v, 1)) for i, v in enumerate(nums)]
            x_label = "Secuencia de registros"
            y_label = col_name
        else:
            warnings.append(
                f"'{col_name}' es de tipo {col_type}; se muestra la frecuencia por categoría."
            )
            counts = Counter(str(v) for v in valid_vals)
            buckets = counts.most_common(12)
            x_label = col_name
            y_label = "Registros"

        if not buckets:
            buckets = [("Sin datos", 0)]

        data = [
            {"name": label, "value": val}
            for label, val in buckets
        ]

        top_label, top_val = max(buckets, key=lambda x: x[1])
        kpis = self._build_kpis(meta, raw_series, buckets, len(sheet.raw_rows))

        return ChartResponse(
            chart_type="line",
            title=f"Tendencia de {col_name} — {sheet.sheet_name}",
            subtitle=f"Serie temporal / secuencial de {total_valid} registros válidos.",
            kpis=kpis,
            data=data,
            x_label=x_label,
            y_label=y_label,
            insight=ChartInsight(
                headline=f"El punto máximo corresponde a '{top_label}' ({top_val}).",
                detail=(
                    f"Análisis sobre {total_valid} registros válidos en '{sheet.sheet_name}'. "
                    "Los gráficos describen los datos cargados; no constituyen una recomendación clínica."
                ),
            ),
            warnings=warnings,
        )

    def _group_dates(
        self, dates: list[pd.Timestamp], max_slices: Optional[int]
    ) -> list[tuple[str, int]]:
        if not dates:
            return []
        sorted_dates = sorted(dates)
        span_days = (sorted_dates[-1] - sorted_dates[0]).days

        grouped: dict[str, int] = defaultdict(int)
        if span_days > 45:
            for d in sorted_dates:
                key = f"{MONTH_NAMES_ES.get(d.month, d.strftime('%m'))} {d.year}"
                grouped[key] += 1
        else:
            for d in sorted_dates:
                key = d.strftime("%d/%m/%Y")
                grouped[key] += 1

        items = list(grouped.items())
        if max_slices and len(items) > max_slices:
            top = sorted(items, key=lambda x: x[1], reverse=True)[: max_slices - 1]
            others = sum(cnt for _, cnt in items) - sum(cnt for _, cnt in top)
            return [*top, ("Otros", others)]
        return items


chart_engine = ChartEngine()
