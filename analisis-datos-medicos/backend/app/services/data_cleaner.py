import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Optional

import pandas as pd


SEMANTIC_NULLS = {
    "",
    "-",
    "—",
    "--",
    "n/a",
    "na",
    "s/n",
    "null",
    "none",
    "no aplica",
    "no acepta",
    "no acepta la toma",
    "no recuerda",
    "no se acuerda",
    "no refiere",
    "desconocido",
}

RATIO_PATTERN = re.compile(
    r"^\s*(\d{2,3}(?:[.,]\d+)?)\s*/\s*(\d{2,3}(?:[.,]\d+)?)\s*$"
)

UNIT_SUFFIX_PATTERN = re.compile(
    r"\s*(%|kg|cm|mmhg|mg/dl|mg/dL|m)\s*$",
    re.IGNORECASE,
)


def normalize_text_token(value: Any) -> str:
    text = " ".join(str(value).strip().split())
    nfkd = unicodedata.normalize("NFKD", text)
    no_accents = "".join(ch for ch in nfkd if not unicodedata.combining(ch))
    return no_accents.lower()


def is_semantic_null(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and pd.isna(value):
        return True
    if isinstance(value, str):
        token = normalize_text_token(value)
        return token in SEMANTIC_NULLS
    return False


def _coerce_numeric(value: Any) -> Optional[float]:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        if pd.isna(value):
            return None
        return float(value)
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned or is_semantic_null(cleaned):
            return None
        cleaned = UNIT_SUFFIX_PATTERN.sub("", cleaned).strip()
        # Replace decimal comma with dot if there's no dot
        if "," in cleaned and "." not in cleaned:
            cleaned = cleaned.replace(",", ".")
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def _coerce_date(value: Any) -> Optional[pd.Timestamp]:
    if isinstance(value, (datetime, date, pd.Timestamp)):
        try:
            ts = pd.Timestamp(value)
            if pd.isna(ts):
                return None
            return ts
        except Exception:
            return None
    if isinstance(value, (int, float, bool)):
        # Avoid interpreting plain numbers like ages as epoch timestamps
        return None
    if isinstance(value, str):
        text = value.strip()
        if not text or is_semantic_null(text):
            return None
        # Require at least one date separator to avoid parsing plain numbers/words
        if not any(sep in text for sep in ("-", "/", ".")):
            return None
        if RATIO_PATTERN.match(text):
            return None
        parsed = pd.to_datetime(text, errors="coerce", dayfirst=True)
        if pd.isna(parsed):
            return None
        return parsed
    return None


def _normalize_category_label(value: Any) -> str:
    text = " ".join(str(value).strip().split())
    if len(text) <= 3 and text.isalpha():
        return text.upper()
    return text[:1].upper() + text[1:].lower() if text else text


@dataclass
class ProfiledColumn:
    meta: dict[str, Any]
    cleaned_values: list[Any]
    raw_values: list[Any]


class DataCleaner:
    """Limpiador, perfilador de tipos y generador de columnas derivadas (ratios A/B)."""

    def profile_sheet(
        self,
        sheet_name: str,
        columns: list[str],
        auto_named_columns: set[str],
        rows: list[dict[str, Any]],
    ) -> tuple[list[str], dict[str, dict[str, Any]], dict[str, list[Any]]]:
        total_rows = len(rows)
        final_order: list[str] = []
        columns_meta: dict[str, dict[str, Any]] = {}
        cleaned_columns: dict[str, list[Any]] = {}

        for col_name in columns:
            raw_vals = [row.get(col_name) for row in rows]
            profile = self._profile_single_column(
                sheet_name=sheet_name,
                col_name=col_name,
                raw_values=raw_vals,
                total_rows=total_rows,
                auto_named=(col_name in auto_named_columns),
            )
            final_order.append(col_name)
            columns_meta[col_name] = profile.meta
            cleaned_columns[col_name] = profile.cleaned_values

            # If compound_ratio, generate two derived numeric columns
            if profile.meta["inferred_type"] == "compound_ratio":
                derived_pairs = self._build_derived_ratio_columns(
                    sheet_name=sheet_name,
                    base_col_name=col_name,
                    raw_values=raw_vals,
                    total_rows=total_rows,
                )
                for d_name, d_meta, d_vals in derived_pairs:
                    if d_name not in columns_meta:
                        final_order.append(d_name)
                        columns_meta[d_name] = d_meta
                        cleaned_columns[d_name] = d_vals

        return final_order, columns_meta, cleaned_columns

    def _profile_single_column(
        self,
        sheet_name: str,
        col_name: str,
        raw_values: list[Any],
        total_rows: int,
        auto_named: bool,
    ) -> ProfiledColumn:
        non_null_raw = [v for v in raw_values if not is_semantic_null(v)]
        non_null_count = len(non_null_raw)
        null_count = max(0, total_rows - non_null_count)
        fill_rate = round((non_null_count / total_rows) * 100.0, 1) if total_rows > 0 else 0.0

        if non_null_count == 0:
            meta = {
                "id": f"{sheet_name}::{col_name}",
                "name": col_name,
                "sheet": sheet_name,
                "inferred_type": "text_id",
                "non_null_count": 0,
                "null_count": null_count,
                "excluded_non_numeric_count": 0,
                "fill_rate": 0.0,
                "unique_count": 0,
                "is_derived": False,
                "auto_named": auto_named,
                "chartable": False,
                "recommended_charts": [],
                "note": "Columna sin datos válidos.",
            }
            return ProfiledColumn(meta=meta, cleaned_values=[None] * total_rows, raw_values=raw_values)

        # 1. Check date
        date_parsed = [_coerce_date(v) if not is_semantic_null(v) else None for v in raw_values]
        date_hits = sum(1 for d in date_parsed if d is not None)
        if date_hits / non_null_count >= 0.75:
            unique_dates = len({d.date().isoformat() for d in date_parsed if d is not None})
            meta = {
                "id": f"{sheet_name}::{col_name}",
                "name": col_name,
                "sheet": sheet_name,
                "inferred_type": "date",
                "non_null_count": date_hits,
                "null_count": total_rows - date_hits,
                "excluded_non_numeric_count": 0,
                "fill_rate": round((date_hits / total_rows) * 100.0, 1) if total_rows > 0 else 0.0,
                "unique_count": unique_dates,
                "is_derived": False,
                "auto_named": auto_named,
                "chartable": True,
                "recommended_charts": ["line", "bar"],
                "note": None,
            }
            return ProfiledColumn(meta=meta, cleaned_values=date_parsed, raw_values=raw_values)

        # 2. Check compound_ratio (A/B, e.g., 120/70)
        ratio_hits = 0
        ratio_cleaned: list[Optional[str]] = []
        for v in raw_values:
            if is_semantic_null(v):
                ratio_cleaned.append(None)
                continue
            m = RATIO_PATTERN.match(str(v))
            if m:
                ratio_hits += 1
                v1 = m.group(1).replace(",", ".")
                v2 = m.group(2).replace(",", ".")
                ratio_cleaned.append(f"{v1}/{v2}")
            else:
                ratio_cleaned.append(None)

        if ratio_hits / non_null_count >= 0.60:
            unique_ratios = len({r for r in ratio_cleaned if r is not None})
            meta = {
                "id": f"{sheet_name}::{col_name}",
                "name": col_name,
                "sheet": sheet_name,
                "inferred_type": "compound_ratio",
                "non_null_count": ratio_hits,
                "null_count": total_rows - ratio_hits,
                "excluded_non_numeric_count": non_null_count - ratio_hits,
                "fill_rate": round((ratio_hits / total_rows) * 100.0, 1) if total_rows > 0 else 0.0,
                "unique_count": unique_ratios,
                "is_derived": False,
                "auto_named": auto_named,
                "chartable": True,
                "recommended_charts": ["bar", "line"],
                "note": "Métrica compuesta A/B; se generaron 2 columnas numéricas derivadas.",
            }
            return ProfiledColumn(meta=meta, cleaned_values=ratio_cleaned, raw_values=raw_values)

        # 3. Check numeric
        raw_present_count = sum(
            1 for v in raw_values if v is not None and str(v).strip() != ""
        )
        numeric_parsed = [_coerce_numeric(v) if not is_semantic_null(v) else None for v in raw_values]
        numeric_hits = sum(1 for n in numeric_parsed if n is not None)
        if numeric_hits / non_null_count >= 0.70:
            excluded_non_numeric = max(0, raw_present_count - numeric_hits)
            valid_nums = [n for n in numeric_parsed if n is not None]
            unique_nums = set(valid_nums)

            # Avoid classifying IDs / cedulas (all unique 9-10 digit integers) as chartable numeric if column name looks like CI/ID?
            # Spec rule: if unique <= 4 and small ints (0/1), treat as categorical
            all_small_ints = all(float(n).is_integer() and 0 <= n <= 10 for n in unique_nums)
            if len(unique_nums) <= 4 and all_small_ints:
                cat_vals = [
                    str(int(n)) if n is not None else None for n in numeric_parsed
                ]
                meta = {
                    "id": f"{sheet_name}::{col_name}",
                    "name": col_name,
                    "sheet": sheet_name,
                    "inferred_type": "categorical",
                    "non_null_count": numeric_hits,
                    "null_count": total_rows - numeric_hits,
                    "excluded_non_numeric_count": excluded_non_numeric,
                    "fill_rate": round((numeric_hits / total_rows) * 100.0, 1) if total_rows > 0 else 0.0,
                    "unique_count": len(unique_nums),
                    "is_derived": False,
                    "auto_named": auto_named,
                    "chartable": True,
                    "recommended_charts": ["pie", "bar"],
                    "note": None,
                }
                return ProfiledColumn(meta=meta, cleaned_values=cat_vals, raw_values=raw_values)

            meta = {
                "id": f"{sheet_name}::{col_name}",
                "name": col_name,
                "sheet": sheet_name,
                "inferred_type": "numeric",
                "non_null_count": numeric_hits,
                "null_count": total_rows - numeric_hits,
                "excluded_non_numeric_count": excluded_non_numeric,
                "fill_rate": round((numeric_hits / total_rows) * 100.0, 1) if total_rows > 0 else 0.0,
                "unique_count": len(unique_nums),
                "is_derived": False,
                "auto_named": auto_named,
                "chartable": True,
                "recommended_charts": ["bar", "pie", "histogram"],
                "note": (
                    f"Se excluyeron {excluded_non_numeric} valores de texto en esta columna numérica."
                    if excluded_non_numeric > 0
                    else None
                ),
            }
            return ProfiledColumn(meta=meta, cleaned_values=numeric_parsed, raw_values=raw_values)

        # 4. Categorical vs text_id
        normalized_cats: list[Optional[str]] = []
        canonical_map: dict[str, str] = {}
        for v in raw_values:
            if is_semantic_null(v):
                normalized_cats.append(None)
                continue
            token = normalize_text_token(v)
            if token not in canonical_map:
                canonical_map[token] = _normalize_category_label(v)
            normalized_cats.append(canonical_map[token])

        unique_cat_count = len(canonical_map)
        avg_len = sum(len(str(v)) for v in non_null_raw) / non_null_count

        is_categorical = (
            (unique_cat_count <= 25 or (unique_cat_count / non_null_count) <= 0.30)
            and avg_len <= 45
        )

        if is_categorical:
            meta = {
                "id": f"{sheet_name}::{col_name}",
                "name": col_name,
                "sheet": sheet_name,
                "inferred_type": "categorical",
                "non_null_count": non_null_count,
                "null_count": null_count,
                "excluded_non_numeric_count": 0,
                "fill_rate": fill_rate,
                "unique_count": unique_cat_count,
                "is_derived": False,
                "auto_named": auto_named,
                "chartable": True,
                "recommended_charts": ["pie", "bar"],
                "note": None,
            }
            return ProfiledColumn(meta=meta, cleaned_values=normalized_cats, raw_values=raw_values)

        # 5. text_id
        meta = {
            "id": f"{sheet_name}::{col_name}",
            "name": col_name,
            "sheet": sheet_name,
            "inferred_type": "text_id",
            "non_null_count": non_null_count,
            "null_count": null_count,
            "excluded_non_numeric_count": 0,
            "fill_rate": fill_rate,
            "unique_count": unique_cat_count,
            "is_derived": False,
            "auto_named": auto_named,
            "chartable": False,
            "recommended_charts": [],
            "note": "Columna de texto libre o identificador; recomendada solo para tabla",
        }
        cleaned_text = [
            None if is_semantic_null(v) else " ".join(str(v).strip().split())
            for v in raw_values
        ]
        return ProfiledColumn(meta=meta, cleaned_values=cleaned_text, raw_values=raw_values)

    def _build_derived_ratio_columns(
        self,
        sheet_name: str,
        base_col_name: str,
        raw_values: list[Any],
        total_rows: int,
    ) -> list[tuple[str, dict[str, Any], list[Optional[float]]]]:
        val1_list: list[Optional[float]] = []
        val2_list: list[Optional[float]] = []

        for v in raw_values:
            if is_semantic_null(v):
                val1_list.append(None)
                val2_list.append(None)
                continue
            m = RATIO_PATTERN.match(str(v))
            if m:
                val1_list.append(float(m.group(1).replace(",", ".")))
                val2_list.append(float(m.group(2).replace(",", ".")))
            else:
                val1_list.append(None)
                val2_list.append(None)

        derived_defs = [
            (f"{base_col_name} (Valor 1 / Sistólica)", val1_list),
            (f"{base_col_name} (Valor 2 / Diastólica)", val2_list),
        ]

        results: list[tuple[str, dict[str, Any], list[Optional[float]]]] = []
        for d_name, d_vals in derived_defs:
            valid = [x for x in d_vals if x is not None]
            non_null = len(valid)
            meta = {
                "id": f"{sheet_name}::{d_name}",
                "name": d_name,
                "sheet": sheet_name,
                "inferred_type": "numeric",
                "non_null_count": non_null,
                "null_count": total_rows - non_null,
                "excluded_non_numeric_count": 0,
                "fill_rate": round((non_null / total_rows) * 100.0, 1) if total_rows > 0 else 0.0,
                "unique_count": len(set(valid)),
                "is_derived": True,
                "auto_named": False,
                "chartable": True,
                "recommended_charts": ["bar", "pie", "histogram"],
                "note": f"Columna numérica derivada automáticamente de '{base_col_name}'.",
            }
            results.append((d_name, meta, d_vals))

        return results
