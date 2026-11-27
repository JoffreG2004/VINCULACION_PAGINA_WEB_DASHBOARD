import io
from datetime import datetime
import openpyxl
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.data_cleaner import DataCleaner
from app.services.excel_parser import ExcelStructureDetector


def _wb_to_bytes(wb: openpyxl.Workbook) -> bytes:
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()


def test_displaced_header_and_merged_title():
    """Escenario 1: Título fusionado fila 1, filas 2-4 vacías, col A vacía, encabezados en fila 5 col B."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "CENTRO"

    ws.merge_cells("A1:E1")
    ws["A1"] = "REPORTE DE ATENCIÓN MÉDICA 2026"

    # Filas 2-4 vacías, columna A vacía, encabezados en fila 5 columna B
    headers = ["N°", "NOMBRES", "EDAD", "GLICEMIA"]
    for idx, h in enumerate(headers, start=2):
        ws.cell(row=5, column=idx, value=h)

    for i in range(1, 7):
        ws.cell(row=5 + i, column=2, value=i)
        ws.cell(row=5 + i, column=3, value=f"Paciente {i}")
        ws.cell(row=5 + i, column=4, value=55 + i)
        ws.cell(row=5 + i, column=5, value=100 + i * 5)

    detector = ExcelStructureDetector()
    tables = detector.parse_workbook(_wb_to_bytes(wb), "desplazado.xlsx")

    assert len(tables) == 1
    table = tables[0]
    assert table.header_row == 5
    assert table.columns == ["N°", "NOMBRES", "EDAD", "GLICEMIA"]
    assert all(not col.startswith("Unnamed") for col in table.columns)
    assert len(table.rows) == 6


def test_column_islands_with_empty_gaps():
    """Escenario 2: Columnas A-E con datos, F-G vacías, H-J con datos antropométricos."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "ISLAS"

    left_headers = ["N°", "PACIENTE", "EDAD", "SEXO", "GLICEMIA"]
    for col_idx, h in enumerate(left_headers, start=1):
        ws.cell(row=1, column=col_idx, value=h)

    # F y G (6, 7) vacías; H, I, J (8, 9, 10) con datos
    right_headers = ["Altura (m)", "Peso (kg)", "IMC"]
    for offset, h in enumerate(right_headers):
        ws.cell(row=1, column=8 + offset, value=h)

    for r in range(2, 8):
        ws.cell(row=r, column=1, value=r - 1)
        ws.cell(row=r, column=2, value=f"Nombre {r}")
        ws.cell(row=r, column=3, value=40 + r)
        ws.cell(row=r, column=4, value="F" if r % 2 == 0 else "M")
        ws.cell(row=r, column=5, value=110 + r)
        ws.cell(row=r, column=8, value=1.65)
        ws.cell(row=r, column=9, value=68.5)
        ws.cell(row=r, column=10, value=25.2)

    detector = ExcelStructureDetector()
    tables = detector.parse_workbook(_wb_to_bytes(wb), "islas.xlsx")

    assert len(tables) == 1
    assert tables[0].columns == [
        "N°",
        "PACIENTE",
        "EDAD",
        "SEXO",
        "GLICEMIA",
        "Altura (m)",
        "Peso (kg)",
        "IMC",
    ]
    assert len(tables[0].rows) == 6


def test_summary_table_at_bottom_excluded():
    """Escenario 3: 20 filas de pacientes, 3 filas vacías y tabla resumen abajo con TOTAL y TA > 130/80 mmHg."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "LORETO"

    headers = ["N°", "NOMBRES", "EDAD", "T.A", "GLICEMIA"]
    ws.append(headers)
    for i in range(1, 21):
        ws.append([i, f"Paciente {i}", 60 + (i % 15), "120/70", 105 + i])

    # 3 filas vacías
    ws.append([])
    ws.append([])
    ws.append([])

    # Tabla resumen debajo
    ws.append(["ESTADO DE LA PRESIÓN ARTERIAL/GLICEMIA CAPILAR", "Glicemia > 140", "TOTAL"])
    ws.append(["TA > 130/80 mmHg", 2, 11])
    ws.append(["TOTAL", 8, 20])

    detector = ExcelStructureDetector()
    tables = detector.parse_workbook(_wb_to_bytes(wb), "resumen.xlsx")

    assert len(tables) == 1
    table = tables[0]
    assert len(table.rows) == 20
    assert any("resumen" in w.lower() for w in table.warnings)


def test_contaminated_numeric_column():
    """Escenario 4: GLICEMIA con 18 números y 2 celdas 'No acepta la toma'."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "CLINICA"

    ws.append(["N°", "GLICEMIA"])
    for i in range(1, 19):
        ws.append([i, 95 + i * 3])
    ws.append([19, "No acepta la toma"])
    ws.append([20, "No acepta la toma"])

    detector = ExcelStructureDetector()
    cleaner = DataCleaner()
    tables = detector.parse_workbook(_wb_to_bytes(wb), "contaminada.xlsx")

    _, cols_meta, _ = cleaner.profile_sheet(
        sheet_name=tables[0].sheet_name,
        columns=tables[0].columns,
        auto_named_columns=tables[0].auto_named_columns,
        rows=tables[0].rows,
    )

    glicemia_meta = cols_meta["GLICEMIA"]
    assert glicemia_meta["inferred_type"] == "numeric"
    assert glicemia_meta["non_null_count"] == 18
    assert glicemia_meta["excluded_non_numeric_count"] == 2


def test_compound_ratio_blood_pressure():
    """Escenario 5: Columna T.A con '120/70', '140/90' -> compound_ratio + 2 derivadas numéricas."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "PRESION"

    ws.append(["N°", "T.A"])
    samples = ["120/70", "140/90", "110/70", "130/80", "125/75", "118/76"]
    for idx, val in enumerate(samples, start=1):
        ws.append([idx, val])

    detector = ExcelStructureDetector()
    cleaner = DataCleaner()
    tables = detector.parse_workbook(_wb_to_bytes(wb), "ratio.xlsx")

    cols_order, cols_meta, cleaned_cols = cleaner.profile_sheet(
        sheet_name=tables[0].sheet_name,
        columns=tables[0].columns,
        auto_named_columns=tables[0].auto_named_columns,
        rows=tables[0].rows,
    )

    assert cols_meta["T.A"]["inferred_type"] == "compound_ratio"
    sistolica_col = "T.A (Valor 1 / Sistólica)"
    diastolica_col = "T.A (Valor 2 / Diastólica)"
    assert sistolica_col in cols_order
    assert diastolica_col in cols_order
    assert cols_meta[sistolica_col]["inferred_type"] == "numeric"
    assert cols_meta[diastolica_col]["inferred_type"] == "numeric"
    assert cleaned_cols[sistolica_col][0] == 120.0
    assert cleaned_cols[diastolica_col][1] == 90.0


def test_full_api_e2e_multisheet_flow():
    """Escenario 6: Upload multi-hoja, preview multi_sheet y generación de gráficos Pie, Bar y Line."""
    wb = openpyxl.Workbook()

    ws1 = wb.active
    ws1.title = "LORETO"
    ws1.append(["N°", "NOMBRES", "EDAD", "FECHA", "SEXO", "GLICEMIA"])
    for i in range(1, 13):
        ws1.append([
            i,
            f"Loreto Pac {i}",
            50 + i * 2,
            datetime(2026, (i % 3) + 1, 10),
            "F" if i % 2 == 0 else "M",
            100 + i * 4,
        ])

    ws2 = wb.create_sheet("ALBORNOZ")
    ws2.append(["N°", "NOMBRES", "EDAD", "T.A"])
    for i in range(1, 11):
        ws2.append([i, f"Albornoz Pac {i}", 45 + i * 3, "120/80" if i % 2 == 0 else "140/90"])

    client = TestClient(app)

    # 1. Inspect / Upload
    upload_res = client.post(
        "/api/excel/inspect",
        files={
            "file": (
                "multi_hoja.xlsx",
                _wb_to_bytes(wb),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert upload_res.status_code == 200
    upload_json = upload_res.json()
    file_id = upload_json["file_id"]
    assert upload_json["total_sheets"] == 2
    assert upload_json["total_records"] == 22

    # 2. Preview multi_sheet
    preview_res = client.post(
        "/api/excel/preview",
        json={
            "file_id": file_id,
            "selections": [
                {"sheet_name": "LORETO", "columns": ["NOMBRES", "EDAD", "GLICEMIA"]},
                {"sheet_name": "ALBORNOZ", "columns": ["NOMBRES", "EDAD", "T.A"]},
            ],
            "limit": 5,
            "offset": 0,
        },
    )
    assert preview_res.status_code == 200
    preview_json = preview_res.json()
    assert preview_json["mode"] == "multi_sheet"
    assert len(preview_json["sheets_preview"]) == 2
    assert preview_json["sheets_preview"][0]["has_more"] is True
    assert len(preview_json["sheets_preview"][0]["rows"]) == 5

    # 3. Chart Pie
    pie_res = client.post(
        "/api/excel/chart",
        json={
            "file_id": file_id,
            "chart_type": "pie",
            "sheet_name": "LORETO",
            "column": "SEXO",
        },
    )
    assert pie_res.status_code == 200
    pie_json = pie_res.json()
    assert len(pie_json["kpis"]) == 4
    assert len(pie_json["data"]) == 2
    assert pie_json["insight"]["headline"]

    # 4. Chart Bar (numeric)
    bar_res = client.post(
        "/api/excel/chart",
        json={
            "file_id": file_id,
            "chart_type": "bar",
            "sheet_name": "LORETO",
            "column": "EDAD",
        },
    )
    assert bar_res.status_code == 200
    bar_json = bar_res.json()
    assert len(bar_json["kpis"]) == 4
    assert len(bar_json["data"]) >= 2

    # 5. Chart Line (date)
    line_res = client.post(
        "/api/excel/chart",
        json={
            "file_id": file_id,
            "chart_type": "line",
            "sheet_name": "LORETO",
            "column": "FECHA",
        },
    )
    assert line_res.status_code == 200
    line_json = line_res.json()
    assert len(line_json["kpis"]) == 4
    assert len(line_json["data"]) == 3
