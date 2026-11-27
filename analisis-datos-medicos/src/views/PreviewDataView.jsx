import { useState } from 'react';
import { FileSpreadsheet, ChevronDown, Loader2 } from 'lucide-react';

function renderCellValue(val) {
  if (val === null || val === undefined || val === '') {
    return <span className="text-[#56748d]">—</span>;
  }
  return String(val);
}

function SheetPreviewTable({
  sheet,
  isMultiSheet,
  loadingMoreSheet,
  onLoadMore,
}) {
  const [isOpen, setIsOpen] = useState(true);
  const isLoadingThis = loadingMoreSheet === sheet.sheet_name;

  if (!isMultiSheet) {
    return (
      <div className="mt-6 bg-white rounded-2xl border border-[#c9dceb] overflow-hidden shadow-card">
        <div className="max-h-[460px] overflow-auto custom-scrollbar">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-[#e6f0fa]">
              <tr className="border-b border-[#cfe0ed]">
                {sheet.columns.map((colName) => (
                  <th
                    key={colName}
                    scope="col"
                    className="px-5 py-3.5 text-xs font-semibold text-[#10263c] whitespace-nowrap"
                  >
                    {colName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((row, rowIdx) => (
                <tr
                  key={`${sheet.sheet_name}-${rowIdx}`}
                  className="border-b border-[#cfe0ed] last:border-b-0 text-sm text-[#23415e] hover:bg-[#f4f8fc] transition-colors"
                >
                  {sheet.columns.map((colName, colIdx) => (
                    <td
                      key={`${rowIdx}-${colName}`}
                      className={`px-5 py-3.5 whitespace-nowrap ${
                        colIdx === 0 ? 'font-medium text-[#10263c]' : ''
                      }`}
                    >
                      {renderCellValue(row[colName])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-3.5 bg-white border-t border-[#cfe0ed] flex flex-wrap items-center justify-between gap-3 text-xs text-[#56748d]">
          <span>
            {sheet.columns.length}{' '}
            {sheet.columns.length === 1
              ? 'columna seleccionada'
              : 'columnas seleccionadas'}{' '}
            · Hoja {sheet.sheet_name}
          </span>

          <div className="flex items-center gap-3">
            {sheet.has_more && (
              <button
                type="button"
                onClick={() => onLoadMore(sheet.sheet_name, sheet.columns)}
                disabled={isLoadingThis}
                className="bg-[#e6f0fa] hover:bg-[#d8e7f3] text-[#1d5b90] font-semibold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-colors disabled:opacity-60"
              >
                {isLoadingThis && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Cargar más registros</span>
              </button>
            )}
            <span>
              Mostrando {sheet.rows.length} de {sheet.total_rows} registros
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Pantalla 3.1: Bloques colapsables por hoja con scroll interno y cabecera sticky
  return (
    <div className="bg-white rounded-2xl border border-[#c9dceb] overflow-hidden shadow-card">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full px-6 py-4 bg-[#f5f9fd] border-b border-[#cfe0ed] flex flex-wrap items-center justify-between gap-3 text-left hover:bg-[#e6f0fa]/60 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <ChevronDown
            className={`w-4 h-4 text-[#1d5b90] transition-transform ${
              isOpen ? 'rotate-0' : '-rotate-90'
            }`}
          />
          <span className="text-base font-semibold text-[#10263c]">
            {sheet.sheet_name}
          </span>
          <span className="bg-[#e6f0fa] text-[#1d5b90] text-xs font-semibold px-2.5 py-0.5 rounded-full">
            {sheet.columns.length}{' '}
            {sheet.columns.length === 1 ? 'columna' : 'columnas'}
          </span>
        </div>

        <span className="text-xs text-[#56748d] font-medium">
          Mostrando {sheet.rows.length} de {sheet.total_rows} registros
        </span>
      </button>

      {isOpen && (
        <>
          <div className="max-h-80 overflow-auto custom-scrollbar">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-[#e6f0fa]">
                <tr className="border-b border-[#cfe0ed]">
                  {sheet.columns.map((colName) => (
                    <th
                      key={colName}
                      scope="col"
                      className="px-5 py-3 text-xs font-semibold text-[#10263c] whitespace-nowrap"
                    >
                      {colName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.rows.map((row, rowIdx) => (
                  <tr
                    key={`${sheet.sheet_name}-${rowIdx}`}
                    className="border-b border-[#cfe0ed] last:border-b-0 text-sm text-[#23415e] hover:bg-[#f4f8fc] transition-colors"
                  >
                    {sheet.columns.map((colName, colIdx) => (
                      <td
                        key={`${rowIdx}-${colName}`}
                        className={`px-5 py-3 whitespace-nowrap ${
                          colIdx === 0 ? 'font-medium text-[#10263c]' : ''
                        }`}
                      >
                        {renderCellValue(row[colName])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-3 bg-white border-t border-[#cfe0ed] flex flex-wrap items-center justify-between gap-2 text-xs text-[#56748d]">
            <span>
              {sheet.columns.length}{' '}
              {sheet.columns.length === 1 ? 'columna' : 'columnas'} en esta hoja
            </span>
            {sheet.has_more ? (
              <button
                type="button"
                onClick={() => onLoadMore(sheet.sheet_name, sheet.columns)}
                disabled={isLoadingThis}
                className="bg-[#e6f0fa] hover:bg-[#d8e7f3] text-[#1d5b90] font-semibold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-colors disabled:opacity-60"
              >
                {isLoadingThis && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Cargar más registros</span>
              </button>
            ) : (
              <span>Todos los registros visibles</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function PreviewDataView({
  fileInfo,
  previewData,
  loadingMoreSheet,
  onLoadMore,
  onBack,
  onGenerateDashboard,
}) {
  if (!previewData) {
    return null;
  }

  const isMultiSheet = previewData.mode === 'multi_sheet';
  const sheets = previewData.sheets_preview || [];

  return (
    <section className="max-w-6xl w-full mx-auto px-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-[#10263c]">
          Previsualización de filas y columnas
        </h1>
        <p className="text-sm text-[#56748d] mt-1">
          {isMultiSheet
            ? 'Vista segmentada por hoja. Revisa los datos limpios antes de generar tu dashboard.'
            : 'Comprueba la selección antes de generar tu dashboard.'}
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="bg-[#e6f0fa] text-[#1d5b90] px-4 py-2 rounded-full text-sm font-medium inline-flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" strokeWidth={2} />
            <span>Archivo seleccionado: {previewData.file_name}</span>
          </div>
          <p className="text-sm text-[#56748d]">
            {isMultiSheet
              ? `${sheets.length} hojas seleccionadas · ${previewData.total_selected_columns} columnas`
              : `Mostrando ${sheets[0]?.rows.length ?? 0} de ${sheets[0]?.total_rows ?? 0} registros`}
          </p>
        </div>
      </div>

      {isMultiSheet ? (
        <div className="mt-6 space-y-5">
          {sheets.map((sheet) => (
            <SheetPreviewTable
              key={sheet.sheet_name}
              sheet={sheet}
              isMultiSheet
              loadingMoreSheet={loadingMoreSheet}
              onLoadMore={onLoadMore}
            />
          ))}
        </div>
      ) : (
        sheets[0] && (
          <SheetPreviewTable
            sheet={sheets[0]}
            isMultiSheet={false}
            loadingMoreSheet={loadingMoreSheet}
            onLoadMore={onLoadMore}
          />
        )
      )}

      <div className="mt-8 pt-6 border-t border-[#cfe0ed] flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="bg-white border border-[#c9dceb] text-[#1d5b90] hover:bg-[#f4f8fc] px-5 py-2.5 rounded-lg font-medium text-sm transition-colors"
        >
          Retroceder
        </button>

        <p className="text-sm text-[#56748d] hidden sm:block">
          El análisis incluirá todos los registros válidos de {fileInfo.name}.
        </p>

        <button
          type="button"
          onClick={onGenerateDashboard}
          className="bg-[#1d5b90] hover:bg-[#123b61] text-white px-6 py-2.5 rounded-lg font-medium text-sm transition-colors"
        >
          Generar Dashboard
        </button>
      </div>
    </section>
  );
}
