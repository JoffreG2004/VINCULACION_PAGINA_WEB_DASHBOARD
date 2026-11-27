import math
import uuid
from datetime import date, datetime, time
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile
import pandas as pd

from app.models.schemas import (
    ChartRequest,
    ChartResponse,
    ColumnMeta,
    PreviewRequest,
    PreviewResponse,
    SheetMeta,
    SheetPreview,
    UploadResponse,
)
from app.services.chart_engine import chart_engine
from app.services.data_cleaner import DataCleaner
from app.services.excel_parser import ExcelStructureDetector
from app.services.session_store import (
    ParsedSheetData,
    ParsedWorkbookSession,
    session_store,
)

router = APIRouter(prefix="/api/excel", tags=["excel"])

_detector = ExcelStructureDetector()
_cleaner = DataCleaner()


def _serialize_cell(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if isinstance(value, pd.Timestamp):
        if pd.isna(value):
            return None
        return value.strftime("%d/%m/%Y")
    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y")
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")
    if isinstance(value, time):
        return value.strftime("%H:%M")
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


@router.post("/inspect", response_model=UploadResponse)
@router.post("/upload", response_model=UploadResponse)
async def upload_excel(file: UploadFile = File(...)) -> UploadResponse:
    file_name = file.filename or "archivo.xlsx"
    lower_name = file_name.lower()
    if not (lower_name.endswith(".xlsx") or lower_name.endswith(".xls") or lower_name.endswith(".xlsm")):
        raise HTTPException(
            status_code=400,
            detail="Formato no compatible. Sube un archivo Excel (.xlsx o .xls).",
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")

    try:
        raw_tables = _detector.parse_workbook(file_bytes, file_name)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"No se pudo leer el archivo Excel: {exc}",
        ) from exc

    if not raw_tables:
        raise HTTPException(
            status_code=400,
            detail="No se detectaron hojas con tablas de datos válidas en el archivo.",
        )

    file_id = str(uuid.uuid4())
    session_sheets: dict[str, ParsedSheetData] = {}
    sheet_order: list[str] = []
    sheets_meta: list[SheetMeta] = []
    total_columns = 0
    total_records = 0

    for table in raw_tables:
        cols_order, cols_meta, cleaned_cols = _cleaner.profile_sheet(
            sheet_name=table.sheet_name,
            columns=table.columns,
            auto_named_columns=table.auto_named_columns,
            rows=table.rows,
        )

        # Build rows including derived columns so preview works for both original and derived columns
        enriched_rows: list[dict[str, Any]] = []
        for row_idx, raw_row in enumerate(table.rows):
            row_dict: dict[str, Any] = {}
            for col_name in cols_order:
                if col_name in raw_row:
                    row_dict[col_name] = _serialize_cell(raw_row[col_name])
                else:
                    # Derived column
                    row_dict[col_name] = _serialize_cell(cleaned_cols[col_name][row_idx])
            enriched_rows.append(row_dict)

        sheet_warnings = list(table.warnings)
        if table.is_possible_summary_sheet:
            sheet_warnings.append(
                "Esta hoja podría corresponder a un consolidado o resumen de otras hojas."
            )

        parsed_sheet = ParsedSheetData(
            sheet_name=table.sheet_name,
            header_row=table.header_row,
            is_possible_summary_sheet=table.is_possible_summary_sheet,
            warnings=sheet_warnings,
            columns_order=cols_order,
            columns_meta=cols_meta,
            raw_rows=enriched_rows,
            cleaned_columns=cleaned_cols,
        )
        session_sheets[table.sheet_name] = parsed_sheet
        sheet_order.append(table.sheet_name)

        col_meta_models = [ColumnMeta(**cols_meta[c]) for c in cols_order]
        sheets_meta.append(
            SheetMeta(
                sheet_name=table.sheet_name,
                header_row=table.header_row,
                total_rows=len(enriched_rows),
                is_possible_summary_sheet=table.is_possible_summary_sheet,
                warnings=sheet_warnings,
                columns=col_meta_models,
            )
        )

        total_columns += len(col_meta_models)
        if not table.is_possible_summary_sheet:
            total_records += len(enriched_rows)

    if total_records == 0:
        total_records = sum(len(s.raw_rows) for s in session_sheets.values())

    session = ParsedWorkbookSession(
        file_id=file_id,
        file_name=file_name,
        created_at=0.0,
        sheets=session_sheets,
        sheet_order=sheet_order,
    )
    import time as _time
    session.created_at = _time.time()
    session_store.save(session)

    return UploadResponse(
        file_id=file_id,
        file_name=file_name,
        total_sheets=len(sheets_meta),
        total_columns=total_columns,
        total_records=total_records,
        sheets=sheets_meta,
    )


@router.post("/preview", response_model=PreviewResponse)
async def preview_excel(req: PreviewRequest) -> PreviewResponse:
    session = session_store.get(req.file_id)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail="La sesión del archivo expiró o no existe. Vuelve a cargar el Excel.",
        )

    sheets_preview: list[SheetPreview] = []
    total_selected_columns = 0

    for selection in req.selections:
        sheet = session.sheets.get(selection.sheet_name)
        if sheet is None:
            continue

        valid_cols = [c for c in selection.columns if c in sheet.columns_meta]
        if not valid_cols:
            continue

        total_selected_columns += len(valid_cols)
        total_rows = len(sheet.raw_rows)
        sliced = sheet.raw_rows[req.offset : req.offset + req.limit]
        projected_rows = [
            {col: row.get(col) for col in valid_cols}
            for row in sliced
        ]

        sheets_preview.append(
            SheetPreview(
                sheet_name=sheet.sheet_name,
                columns=valid_cols,
                total_rows=total_rows,
                returned_rows=len(projected_rows),
                has_more=(req.offset + len(projected_rows)) < total_rows,
                rows=projected_rows,
            )
        )

    mode = "multi_sheet" if len(sheets_preview) > 1 else "single_sheet"

    return PreviewResponse(
        file_name=session.file_name,
        mode=mode,
        total_selected_columns=total_selected_columns,
        sheets_preview=sheets_preview,
    )


@router.post("/chart", response_model=ChartResponse)
async def generate_chart(req: ChartRequest) -> ChartResponse:
    session = session_store.get(req.file_id)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail="La sesión del archivo expiró o no existe. Vuelve a cargar el Excel.",
        )

    try:
        return chart_engine.generate_chart(session, req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
