import io
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime, time
from typing import Any, Optional

import openpyxl
from openpyxl.utils import get_column_letter
import xlrd


SUMMARY_ROW_PATTERN = re.compile(
    r"^(total|totales|resumen|promedio|subtotal|media|porcentaje|mayor a|menor a|"
    r"ta\s*[><=]|presion alta|presion normal|hiperglicemia|normoglicemic|"
    r"estado\s+(?:de\s+la\s+)?presion|elevacion\s+ta)\b",
    re.IGNORECASE,
)

SUMMARY_SHEET_KEYWORDS = (
    "total",
    "consolidado",
    "general",
    "respuestas de formulario",
    "resumen",
)


def _strip_accents(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in nfkd if not unicodedata.combining(ch))


def _is_empty_cell(val: Any) -> bool:
    if val is None:
        return True
    if isinstance(val, str) and val.strip() == "":
        return True
    return False


def _is_numeric_like(val: Any) -> bool:
    if isinstance(val, bool):
        return False
    if isinstance(val, (int, float)):
        return True
    if isinstance(val, str):
        s = val.strip().replace(",", ".")
        if not s:
            return False
        try:
            float(s)
            return True
        except ValueError:
            return False
    return False


def _normalize_header_name(raw: Any) -> str:
    return " ".join(str(raw).split())


@dataclass
class RawSheetTable:
    sheet_name: str
    header_row: int  # 1-based Excel row index
    columns: list[str]
    auto_named_columns: set[str]
    rows: list[dict[str, Any]]
    is_possible_summary_sheet: bool = False
    warnings: list[str] = field(default_factory=list)


class ExcelStructureDetector:
    """Motor universal para detectar estructura, encabezados, islas y fin de tabla en Excel."""

    def parse_workbook(self, file_bytes: bytes, file_name: str) -> list[RawSheetTable]:
        ext = file_name.lower().rsplit(".", 1)[-1] if "." in file_name else "xlsx"
        if ext == "xls":
            raw_sheets = self._load_xls(file_bytes)
        else:
            raw_sheets = self._load_xlsx(file_bytes)

        parsed_tables: list[RawSheetTable] = []
        for sheet_info in raw_sheets:
            table = self._process_sheet(
                sheet_name=sheet_info["sheet_name"],
                matrix=sheet_info["matrix"],
                merged_spans=sheet_info["merged_spans"],
                row_offset=sheet_info["row_offset"],
            )
            if table is not None:
                parsed_tables.append(table)

        self._flag_summary_sheets(parsed_tables)
        return parsed_tables

    def _load_xlsx(self, file_bytes: bytes) -> list[dict[str, Any]]:
        wb = openpyxl.load_workbook(
            io.BytesIO(file_bytes), data_only=True, read_only=False
        )
        sheets_data: list[dict[str, Any]] = []

        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            if ws.sheet_state != "visible":
                continue

            max_row = ws.max_row or 0
            max_col = ws.max_column or 0
            if max_row == 0 or max_col == 0:
                continue

            # Extract matrix and trim trailing completely empty rows
            matrix: list[list[Any]] = []
            non_empty_total = 0
            last_non_empty_row = -1
            last_non_empty_col = -1

            for r_idx, row_vals in enumerate(
                ws.iter_rows(min_row=1, max_row=max_row, min_col=1, max_col=max_col, values_only=True)
            ):
                row_list = list(row_vals)
                row_has_data = False
                for c_idx, val in enumerate(row_list):
                    if not _is_empty_cell(val):
                        non_empty_total += 1
                        row_has_data = True
                        if c_idx > last_non_empty_col:
                            last_non_empty_col = c_idx
                matrix.append(row_list)
                if row_has_data:
                    last_non_empty_row = r_idx

            if non_empty_total < 3 or last_non_empty_row < 0 or last_non_empty_col < 0:
                continue

            trimmed_matrix = [
                row[: last_non_empty_col + 1]
                for row in matrix[: last_non_empty_row + 1]
            ]

            merged_spans: list[tuple[int, int, int, int]] = []
            for m_range in ws.merged_cells.ranges:
                # 0-based (min_row, max_row, min_col, max_col) inclusive
                merged_spans.append(
                    (
                        m_range.min_row - 1,
                        m_range.max_row - 1,
                        m_range.min_col - 1,
                        m_range.max_col - 1,
                    )
                )

            sheets_data.append(
                {
                    "sheet_name": sheet_name,
                    "matrix": trimmed_matrix,
                    "merged_spans": merged_spans,
                    "row_offset": 1,
                }
            )

        wb.close()
        return sheets_data

    def _load_xls(self, file_bytes: bytes) -> list[dict[str, Any]]:
        book = xlrd.open_workbook(file_contents=file_bytes)
        sheets_data: list[dict[str, Any]] = []

        for sheet in book.sheets():
            if sheet.visibility != 0:
                continue
            if sheet.nrows == 0 or sheet.ncols == 0:
                continue

            matrix: list[list[Any]] = []
            non_empty_total = 0
            last_non_empty_row = -1
            last_non_empty_col = -1

            for r_idx in range(sheet.nrows):
                row_list: list[Any] = []
                row_has_data = False
                for c_idx in range(sheet.ncols):
                    cell = sheet.cell(r_idx, c_idx)
                    val: Any = cell.value
                    if cell.ctype == xlrd.XL_CELL_DATE:
                        try:
                            val = xlrd.xldate_as_datetime(val, book.datemode)
                        except Exception:
                            pass
                    elif cell.ctype == xlrd.XL_CELL_EMPTY:
                        val = None
                    if not _is_empty_cell(val):
                        non_empty_total += 1
                        row_has_data = True
                        if c_idx > last_non_empty_col:
                            last_non_empty_col = c_idx
                    row_list.append(val)
                matrix.append(row_list)
                if row_has_data:
                    last_non_empty_row = r_idx

            if non_empty_total < 3 or last_non_empty_row < 0 or last_non_empty_col < 0:
                continue

            trimmed_matrix = [
                row[: last_non_empty_col + 1]
                for row in matrix[: last_non_empty_row + 1]
            ]
            merged_spans = [
                (rlo, rhi - 1, clo, chi - 1)
                for (rlo, rhi, clo, chi) in getattr(sheet, "merged_cells", [])
            ]
            sheets_data.append(
                {
                    "sheet_name": sheet.name,
                    "matrix": trimmed_matrix,
                    "merged_spans": merged_spans,
                    "row_offset": 1,
                }
            )

        return sheets_data

    def _process_sheet(
        self,
        sheet_name: str,
        matrix: list[list[Any]],
        merged_spans: list[tuple[int, int, int, int]],
        row_offset: int = 1,
    ) -> Optional[RawSheetTable]:
        if len(matrix) < 2:
            return None

        header_idx = self.detect_header_row(matrix, merged_spans)
        if header_idx is None or header_idx >= len(matrix) - 1:
            return None

        # Phase 3: Detect valid columns (handling empty left columns and data islands)
        header_row_vals = matrix[header_idx]
        num_cols = len(header_row_vals)

        # Look ahead across data rows below header to know which columns carry real data
        provisional_data = matrix[header_idx + 1 :]
        valid_col_indices: list[int] = []
        raw_col_names: list[str] = []
        auto_named_columns: set[str] = set()
        seen_names: dict[str, int] = {}

        # Optional 2-level merged parent header check on header_idx - 1
        parent_headers: dict[int, str] = {}
        if header_idx > 0:
            for rlo, rhi, clo, chi in merged_spans:
                if rlo <= header_idx - 1 <= rhi and (chi - clo + 1) >= 2:
                    # Only treat as group header if it doesn't cover almost the whole sheet like a title banner
                    if (chi - clo + 1) < max(4, int(num_cols * 0.6)):
                        parent_val = matrix[rlo][clo]
                        if not _is_empty_cell(parent_val):
                            parent_str = _normalize_header_name(parent_val)
                            for c in range(clo, min(chi + 1, num_cols)):
                                parent_headers[c] = parent_str

        for c_idx in range(num_cols):
            raw_header = header_row_vals[c_idx]
            col_data_count = sum(
                1 for row in provisional_data if c_idx < len(row) and not _is_empty_cell(row[c_idx])
            )

            header_empty = _is_empty_cell(raw_header)
            if header_empty and col_data_count < 2:
                # Empty column on the left or empty gap ("island" separator)
                continue

            if header_empty:
                base_name = f"Columna_{get_column_letter(c_idx + 1)}"
                is_auto = True
            else:
                base_name = _normalize_header_name(raw_header)
                if not base_name:
                    base_name = f"Columna_{get_column_letter(c_idx + 1)}"
                    is_auto = True
                else:
                    is_auto = False

            # Deduplicate repeated column names in the same sheet
            if base_name in seen_names:
                seen_names[base_name] += 1
                final_name = f"{base_name} ({seen_names[base_name]})"
            else:
                seen_names[base_name] = 1
                final_name = base_name

            if is_auto:
                auto_named_columns.add(final_name)

            valid_col_indices.append(c_idx)
            raw_col_names.append(final_name)

        if not valid_col_indices:
            return None

        # Phase 4: Intelligent table end detection
        data_rows, warnings = self.detect_table_end(
            matrix=matrix,
            header_idx=header_idx,
            valid_col_indices=valid_col_indices,
            col_names=raw_col_names,
        )

        # Remove columns that turned out to have zero data in the main table and had auto-generated names
        filtered_indices: list[int] = []
        filtered_names: list[str] = []
        for idx, col_name in zip(valid_col_indices, raw_col_names):
            has_any = any(not _is_empty_cell(row.get(col_name)) for row in data_rows)
            if not has_any and col_name in auto_named_columns:
                auto_named_columns.discard(col_name)
                continue
            filtered_indices.append(idx)
            filtered_names.append(col_name)

        if not filtered_names:
            return None

        cleaned_rows = [
            {name: row.get(name) for name in filtered_names}
            for row in data_rows
        ]

        return RawSheetTable(
            sheet_name=sheet_name,
            header_row=header_idx + row_offset,
            columns=filtered_names,
            auto_named_columns=auto_named_columns,
            rows=cleaned_rows,
            warnings=warnings,
        )

    def detect_header_row(
        self,
        matrix: list[list[Any]],
        merged_spans: list[tuple[int, int, int, int]],
    ) -> Optional[int]:
        """Escanea hasta 25 filas iniciales y elige la fila con mayor puntaje estructural."""
        scan_limit = min(25, len(matrix) - 1)
        if scan_limit <= 0:
            return 0 if matrix else None

        best_idx: Optional[int] = None
        best_score = float("-inf")

        for r in range(scan_limit):
            row = matrix[r]
            non_empty_indices = [i for i, val in enumerate(row) if not _is_empty_cell(val)]
            if not non_empty_indices:
                continue

            # Check if row is inside a wide merged title cell
            wide_merge_penalty = 0.0
            for rlo, rhi, clo, chi in merged_spans:
                if rlo <= r <= rhi and (chi - clo + 1) >= 3:
                    wide_merge_penalty += 25.0

            text_cells: list[str] = []
            numeric_or_date_count = 0

            for i in non_empty_indices:
                val = row[i]
                if isinstance(val, (datetime, date, time)):
                    numeric_or_date_count += 1
                elif _is_numeric_like(val):
                    numeric_or_date_count += 1
                else:
                    s = _normalize_header_name(val)
                    if 1 <= len(s) <= 80:
                        text_cells.append(s)

            # Title row penalty: only 1 or 2 non-empty cells
            if len(non_empty_indices) <= 2:
                title_penalty = 30.0
            else:
                title_penalty = 0.0

            if not text_cells:
                continue

            unique_ratio = len({t.lower() for t in text_cells}) / len(text_cells)
            text_score = len(text_cells) * 4.0 * unique_ratio
            num_penalty = numeric_or_date_count * 3.0

            # Lookahead validation in r+1 .. r+5
            lookahead_end = min(len(matrix), r + 6)
            aligned_data_hits = 0
            aligned_rows = 0
            for nr in range(r + 1, lookahead_end):
                next_row = matrix[nr]
                row_hits = sum(
                    1
                    for c in non_empty_indices
                    if c < len(next_row) and not _is_empty_cell(next_row[c])
                )
                if row_hits >= max(2, int(len(non_empty_indices) * 0.4)):
                    aligned_rows += 1
                aligned_data_hits += row_hits

            lookahead_bonus = aligned_rows * 3.5 + (aligned_data_hits * 0.5)

            # Slight preference for earlier rows when equally good
            position_bias = -r * 0.15

            score = (
                text_score
                + lookahead_bonus
                + position_bias
                - title_penalty
                - wide_merge_penalty
                - num_penalty
            )

            if score > best_score:
                best_score = score
                best_idx = r

        return best_idx

    def detect_table_end(
        self,
        matrix: list[list[Any]],
        header_idx: int,
        valid_col_indices: list[int],
        col_names: list[str],
    ) -> tuple[list[dict[str, Any]], list[str]]:
        """Detiene la lectura ante saltos vacíos (>=2 filas) o tablas de resumen incrustadas."""
        rows: list[dict[str, Any]] = []
        warnings: list[str] = []
        consecutive_empty = 0
        total_cols = len(valid_col_indices)
        min_cells_required = 1 if total_cols == 1 else 2

        for r in range(header_idx + 1, len(matrix)):
            raw_row = matrix[r]
            extracted: dict[str, Any] = {}
            non_empty_vals: list[Any] = []

            for c_idx, col_name in zip(valid_col_indices, col_names):
                val = raw_row[c_idx] if c_idx < len(raw_row) else None
                if isinstance(val, str):
                    val = val.strip()
                    if val == "":
                        val = None
                extracted[col_name] = val
                if val is not None:
                    non_empty_vals.append(val)

            if len(non_empty_vals) == 0:
                consecutive_empty += 1
                if consecutive_empty >= 2 and len(rows) > 0:
                    # Check if there's auxiliary content below to inform the user
                    has_more_below = any(
                        any(
                            c_idx < len(matrix[fr]) and not _is_empty_cell(matrix[fr][c_idx])
                            for c_idx in valid_col_indices
                        )
                        for fr in range(r + 1, len(matrix))
                    )
                    if has_more_below:
                        warnings.append(
                            "Se detectó y excluyó una tabla de resumen al final de la hoja."
                        )
                    break
                continue

            consecutive_empty = 0

            # Rule 2: Summary / total row detection
            fill_ratio = len(non_empty_vals) / max(1, total_cols)
            if fill_ratio < 0.35:
                # Inspect the first 2 non-empty string values
                first_texts = [
                    _strip_accents(_normalize_header_name(v)).lower()
                    for v in non_empty_vals[:2]
                    if isinstance(v, str)
                ]
                if any(SUMMARY_ROW_PATTERN.match(t) for t in first_texts):
                    warnings.append(
                        "Se detectó y excluyó una tabla de resumen al final de la hoja."
                    )
                    break

            # Discard residual rows with < 2 valid cells (ghost formatting / lone count)
            if len(non_empty_vals) < min_cells_required:
                continue

            rows.append(extracted)

        return rows, warnings

    def _flag_summary_sheets(self, tables: list[RawSheetTable]) -> None:
        for idx, table in enumerate(tables):
            norm_name = _strip_accents(table.sheet_name).lower()
            if any(kw in norm_name for kw in SUMMARY_SHEET_KEYWORDS):
                table.is_possible_summary_sheet = True
                continue

            # Compare against other sheets sharing >= 50% columns
            if len(tables) >= 3 and len(table.rows) > 0:
                cols_set = {c.lower() for c in table.columns}
                other_similar_rows = 0
                similar_count = 0
                for j, other in enumerate(tables):
                    if idx == j:
                        continue
                    other_cols = {c.lower() for c in other.columns}
                    overlap = len(cols_set & other_cols) / max(1, len(cols_set))
                    if overlap >= 0.5:
                        other_similar_rows += len(other.rows)
                        similar_count += 1

                if similar_count >= 2 and other_similar_rows > 0:
                    ratio = len(table.rows) / other_similar_rows
                    if 0.85 <= ratio <= 1.15:
                        table.is_possible_summary_sheet = True
