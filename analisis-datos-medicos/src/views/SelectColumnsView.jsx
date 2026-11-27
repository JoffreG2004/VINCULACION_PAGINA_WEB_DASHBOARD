import {
  FileSpreadsheet,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronsRight,
  ChevronsLeft,
  Check,
  Minus,
  AlertCircle,
  Loader2,
} from 'lucide-react';

const TYPE_BADGE_MAP = {
  numeric: {
    label: 'Num',
    className: 'bg-[#e6f0fa] text-[#1d5b90]',
  },
  categorical: {
    label: 'Cat',
    className: 'bg-[#d8e7f3] text-[#23415e]',
  },
  date: {
    label: 'Fecha',
    className: 'bg-[#f5f9fd] border border-[#c9dceb] text-[#1d5b90]',
  },
  compound_ratio: {
    label: 'Ratio',
    className: 'bg-[#e6f0fa] border border-[#72a4cf] text-[#123b61]',
  },
  text_id: {
    label: 'Texto',
    className: 'bg-[#f4f8fc] border border-[#c9dceb] text-[#56748d]',
  },
};

function TriStateCheckbox({ checked, indeterminate = false }) {
  return (
    <span
      aria-hidden="true"
      className={`w-4 h-4 rounded flex items-center justify-center border transition-colors shrink-0 ${
        checked || indeterminate
          ? 'bg-[#1d5b90] border-[#1d5b90] text-white'
          : 'bg-white border-[#aec3d3]'
      }`}
    >
      {checked && <Check className="w-3 h-3" strokeWidth={3} />}
      {!checked && indeterminate && <Minus className="w-3 h-3" strokeWidth={3} />}
    </span>
  );
}

function SheetAccordionList({
  groupedSheets,
  sheetMetaByName,
  openSheets,
  onToggleSheet,
  onToggleSheetCheckAll,
  onToggleColumn,
  emptyMessage,
}) {
  if (groupedSheets.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-[#56748d] text-center px-4">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
      {groupedSheets.map(({ sheet, columns }) => {
        const isOpen = openSheets[sheet] ?? true;
        const checkedCount = columns.filter((c) => c.checked).length;
        const allChecked = columns.length > 0 && checkedCount === columns.length;
        const someChecked = checkedCount > 0 && checkedCount < columns.length;
        const meta = sheetMetaByName[sheet];

        return (
          <div key={sheet} className="space-y-1">
            <div className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#f5f9fd] hover:bg-[#e6f0fa] transition-colors gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => onToggleSheetCheckAll(sheet)}
                  title={`Seleccionar todas las columnas de ${sheet}`}
                  aria-label={`Seleccionar todas las columnas de ${sheet}`}
                  className="p-0.5 rounded focus:outline-none"
                >
                  <TriStateCheckbox
                    checked={allChecked}
                    indeterminate={someChecked}
                  />
                </button>

                <button
                  type="button"
                  onClick={() => onToggleSheet(sheet)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-[#10263c] min-w-0 text-left"
                >
                  <ChevronDown
                    className={`w-4 h-4 text-[#56748d] shrink-0 transition-transform ${
                      isOpen ? 'rotate-0' : '-rotate-90'
                    }`}
                  />
                  <span className="truncate">{sheet}</span>
                </button>

                {meta?.is_possible_summary_sheet && (
                  <span
                    title="Esta hoja podría ser un consolidado o resumen"
                    className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#e6f0fa] text-[#1d5b90] border border-[#c9dceb] shrink-0"
                  >
                    Consolidado
                  </span>
                )}
              </div>

              <span className="text-xs text-[#56748d] font-medium shrink-0">
                {columns.length}
              </span>
            </div>

            {isOpen && (
              <ul className="space-y-1 pl-2">
                {columns.map((col) => {
                  const typeBadge =
                    TYPE_BADGE_MAP[col.inferred_type] || TYPE_BADGE_MAP.text_id;
                  const lowFill = col.fill_rate < 60;

                  return (
                    <li key={col.id}>
                      <button
                        type="button"
                        onClick={() => onToggleColumn(col.id)}
                        title={col.note || `${col.name} (${col.fill_rate}% datos)`}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                          col.checked
                            ? 'bg-[#e6f0fa] text-[#10263c] font-medium'
                            : 'text-[#23415e] hover:bg-[#f4f8fc]'
                        }`}
                      >
                        <span className="flex items-center gap-2.5 min-w-0">
                          <TriStateCheckbox checked={col.checked} />
                          <span className="truncate">{col.name}</span>
                        </span>

                        <span className="flex items-center gap-1.5 shrink-0">
                          {col.is_derived && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#f5f9fd] border border-[#c9dceb] text-[#56748d]">
                              Derivada
                            </span>
                          )}
                          {lowFill && (
                            <span className="text-[10px] text-[#56748d]">
                              {col.fill_rate}%
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${typeBadge.className}`}
                          >
                            {typeBadge.label}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function SelectColumnsView({
  fileInfo,
  columnState,
  isLoadingPreview,
  previewError,
  onBack,
  onNext,
}) {
  const {
    sheetMetaByName,
    availableColumns,
    selectedColumns,
    groupedAvailable,
    groupedSelected,
    searchQuery,
    setSearchQuery,
    openAvailableSheets,
    openSelectedSheets,
    toggleAvailableSheet,
    toggleSelectedSheet,
    toggleAvailableSheetCheckAll,
    toggleSelectedSheetCheckAll,
    toggleAvailableColumn,
    toggleSelectedColumn,
    moveCheckedToSelected,
    moveAllToSelected,
    moveCheckedToAvailable,
    moveAllToAvailable,
    checkedAvailableCount,
    checkedSelectedCount,
  } = columnState;

  const markedText =
    checkedAvailableCount === 1
      ? '1 columna marcada para añadir'
      : `${checkedAvailableCount} columnas marcadas para añadir`;

  return (
    <section className="max-w-6xl w-full mx-auto px-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-[#10263c]">
          Selecciona los datos que quieres analizar
        </h1>
        <p className="text-sm text-[#56748d] mt-1">
          Explora las hojas detectadas, marca por hoja o columna y mueve lo que necesitas a tu selección.
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="bg-[#e6f0fa] text-[#1d5b90] px-4 py-2 rounded-full text-sm font-medium inline-flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" strokeWidth={2} />
            <span>Archivo seleccionado: {fileInfo.name}</span>
          </div>
          <p className="text-sm text-[#56748d]">
            {fileInfo.totalSheets} {fileInfo.totalSheets === 1 ? 'hoja detectada' : 'hojas detectadas'} ·{' '}
            {fileInfo.totalColumns} columnas en total
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-6 items-center">
        {/* Panel Izquierdo */}
        <div className="bg-white rounded-2xl border border-[#c9dceb] p-5 flex flex-col h-[480px] shadow-card">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[#10263c] font-semibold text-base">
              Columnas y hojas detectadas
            </h2>
            <span className="text-[#56748d] text-sm">
              {availableColumns.length} disponibles
            </span>
          </div>

          <div className="mt-3 relative">
            <Search className="w-4 h-4 text-[#56748d] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar columna u hoja"
              aria-label="Buscar columna u hoja"
              className="w-full pl-9 pr-3 py-2 text-sm text-[#10263c] placeholder:text-[#56748d] bg-white border border-[#c9dceb] rounded-lg focus:outline-none focus:border-[#1d5b90] focus:ring-2 focus:ring-[#e6f0fa]"
            />
          </div>

          <div className="mt-3 flex-1 min-h-0 flex flex-col">
            <SheetAccordionList
              groupedSheets={groupedAvailable}
              sheetMetaByName={sheetMetaByName}
              openSheets={openAvailableSheets}
              onToggleSheet={toggleAvailableSheet}
              onToggleSheetCheckAll={toggleAvailableSheetCheckAll}
              onToggleColumn={toggleAvailableColumn}
              emptyMessage={
                availableColumns.length === 0
                  ? 'Todas las columnas fueron añadidas a tu selección.'
                  : 'No hay columnas que coincidan con tu búsqueda.'
              }
            />
          </div>

          <div className="pt-3 mt-2 border-t border-[#cfe0ed]/60 text-xs text-[#56748d]">
            {markedText}
          </div>
        </div>

        {/* Botones centrales de transferencia */}
        <div className="flex lg:flex-col items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={moveAllToSelected}
            disabled={availableColumns.length === 0}
            title="Mover todas las columnas a seleccionadas"
            aria-label="Mover todas las columnas a seleccionadas"
            className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors bg-white border border-[#c9dceb] text-[#23415e] hover:bg-[#f4f8fc] disabled:opacity-45 disabled:cursor-not-allowed"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={moveCheckedToSelected}
            disabled={checkedAvailableCount === 0}
            title="Mover columnas marcadas a seleccionadas"
            aria-label="Mover columnas marcadas a seleccionadas"
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
              checkedAvailableCount > 0
                ? 'bg-[#1d5b90] hover:bg-[#123b61] text-white shadow-sm'
                : 'bg-white border border-[#c9dceb] text-[#23415e] hover:bg-[#f4f8fc]'
            }`}
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={moveAllToAvailable}
            disabled={selectedColumns.length === 0}
            title="Devolver todas las columnas a disponibles"
            aria-label="Devolver todas las columnas a disponibles"
            className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors bg-white border border-[#c9dceb] text-[#23415e] hover:bg-[#f4f8fc] disabled:opacity-45 disabled:cursor-not-allowed"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={moveCheckedToAvailable}
            disabled={checkedSelectedCount === 0}
            title="Devolver columnas marcadas a disponibles"
            aria-label="Devolver columnas marcadas a disponibles"
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
              checkedSelectedCount > 0
                ? 'bg-[#1d5b90] hover:bg-[#123b61] text-white shadow-sm'
                : 'bg-white border border-[#c9dceb] text-[#23415e] hover:bg-[#f4f8fc]'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Panel Derecho */}
        <div className="bg-white rounded-2xl border border-[#c9dceb] p-5 flex flex-col h-[480px] shadow-card">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[#10263c] font-semibold text-base">
              Columnas seleccionadas
            </h2>
            <span className="bg-[#e6f0fa] text-[#1d5b90] text-xs font-semibold px-3 py-1 rounded-full">
              {selectedColumns.length}{' '}
              {selectedColumns.length === 1 ? 'columna' : 'columnas'}
            </span>
          </div>

          <div className="mt-3 flex-1 min-h-0 flex flex-col">
            <SheetAccordionList
              groupedSheets={groupedSelected}
              sheetMetaByName={sheetMetaByName}
              openSheets={openSelectedSheets}
              onToggleSheet={toggleSelectedSheet}
              onToggleSheetCheckAll={toggleSelectedSheetCheckAll}
              onToggleColumn={toggleSelectedColumn}
              emptyMessage="Marca columnas o una hoja completa en el panel izquierdo y muévelas aquí."
            />
          </div>

          <div className="pt-3 mt-2 border-t border-[#cfe0ed]/60 text-xs text-[#56748d]">
            Se conservará el orden de las columnas por hoja.
          </div>
        </div>
      </div>

      {previewError && (
        <div className="mt-5 bg-[#f5f9fd] border border-[#1d5b90] rounded-xl p-4 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-[#1d5b90] shrink-0 mt-0.5" />
          <p className="text-xs text-[#10263c]">{previewError}</p>
        </div>
      )}

      {/* Barra inferior de navegación */}
      <div className="mt-8 pt-6 border-t border-[#cfe0ed] flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="bg-white border border-[#c9dceb] text-[#1d5b90] hover:bg-[#f4f8fc] px-5 py-2.5 rounded-lg font-medium text-sm transition-colors"
        >
          Retroceder
        </button>

        <p className="text-sm text-[#56748d] hidden sm:block">
          Puedes combinar columnas de distintas hojas.
        </p>

        <button
          type="button"
          onClick={onNext}
          disabled={selectedColumns.length === 0 || isLoadingPreview}
          className="bg-[#1d5b90] hover:bg-[#123b61] disabled:bg-[#d8e7f3] disabled:text-[#56748d] disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg font-medium text-sm inline-flex items-center gap-2 transition-colors"
        >
          {isLoadingPreview && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>{isLoadingPreview ? 'Cargando vista...' : 'Siguiente'}</span>
        </button>
      </div>
    </section>
  );
}
