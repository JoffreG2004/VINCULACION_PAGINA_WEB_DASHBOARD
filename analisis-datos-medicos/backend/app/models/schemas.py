from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


ColumnType = Literal["numeric", "categorical", "date", "compound_ratio", "text_id"]


class ColumnMeta(BaseModel):
    id: str
    name: str
    sheet: str
    inferred_type: ColumnType
    non_null_count: int
    null_count: int
    excluded_non_numeric_count: int = 0
    fill_rate: float
    unique_count: int
    is_derived: bool = False
    auto_named: bool = False
    chartable: bool = True
    recommended_charts: list[str] = Field(default_factory=list)
    note: Optional[str] = None


class SheetMeta(BaseModel):
    sheet_name: str
    header_row: int
    total_rows: int
    is_possible_summary_sheet: bool = False
    warnings: list[str] = Field(default_factory=list)
    columns: list[ColumnMeta] = Field(default_factory=list)


class UploadResponse(BaseModel):
    file_id: str
    file_name: str
    total_sheets: int
    total_columns: int
    total_records: int
    sheets: list[SheetMeta]


class SheetSelection(BaseModel):
    sheet_name: str
    columns: list[str]


class PreviewRequest(BaseModel):
    file_id: str
    selections: list[SheetSelection]
    limit: int = Field(default=50, ge=1, le=500)
    offset: int = Field(default=0, ge=0)


class SheetPreview(BaseModel):
    sheet_name: str
    columns: list[str]
    total_rows: int
    returned_rows: int
    has_more: bool
    rows: list[dict[str, Any]]


class PreviewResponse(BaseModel):
    file_name: str
    mode: Literal["single_sheet", "multi_sheet"]
    total_selected_columns: int
    sheets_preview: list[SheetPreview]


class ChartRequest(BaseModel):
    file_id: str
    chart_type: Literal["pie", "bar", "line"]
    sheet_name: str
    column: str
    secondary_column: Optional[str] = None
    aggregation: Literal["count", "avg", "sum"] = "count"
    compare_sheets: Optional[list[str]] = None


class ChartKpi(BaseModel):
    label: str
    value: str
    detail: str


class ChartInsight(BaseModel):
    headline: str
    detail: str


class ChartResponse(BaseModel):
    chart_type: str
    title: str
    subtitle: str
    kpis: list[ChartKpi]
    data: list[dict[str, Any]]
    x_label: str
    y_label: str
    insight: ChartInsight
    warnings: list[str] = Field(default_factory=list)
