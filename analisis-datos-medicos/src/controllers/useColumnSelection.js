import { useState, useMemo, useCallback } from 'react';

function groupColumnsByOrderedSheets(columns, sheetOrder) {
  const orderIndex = new Map(sheetOrder.map((name, idx) => [name, idx]));
  const groupedMap = new Map();

  for (const col of columns) {
    if (!groupedMap.has(col.sheet)) {
      groupedMap.set(col.sheet, []);
    }
    groupedMap.get(col.sheet).push(col);
  }

  return Array.from(groupedMap.entries())
    .sort((a, b) => {
      const idxA = orderIndex.has(a[0]) ? orderIndex.get(a[0]) : 9999;
      const idxB = orderIndex.has(b[0]) ? orderIndex.get(b[0]) : 9999;
      return idxA - idxB;
    })
    .map(([sheet, cols]) => ({ sheet, columns: cols }));
}

/**
 * Controlador interactivo para explorar hojas reales, buscar, marcar por hoja/columna
 * y transferir columnas entre paneles.
 */
export function useColumnSelection() {
  const [sheetOrder, setSheetOrder] = useState([]);
  const [sheetMetaByName, setSheetMetaByName] = useState({});
  const [availableColumns, setAvailableColumns] = useState([]);
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [openAvailableSheets, setOpenAvailableSheets] = useState({});
  const [openSelectedSheets, setOpenSelectedSheets] = useState({});

  const initFromUpload = useCallback((sheets) => {
    const order = sheets.map((s) => s.sheet_name);
    const metaMap = {};
    const allCols = [];
    const initialOpen = {};

    sheets.forEach((sheet, idx) => {
      metaMap[sheet.sheet_name] = {
        header_row: sheet.header_row,
        total_rows: sheet.total_rows,
        is_possible_summary_sheet: sheet.is_possible_summary_sheet,
        warnings: sheet.warnings || [],
      };
      // Expand first 3 sheets by default so large workbooks stay scannable
      initialOpen[sheet.sheet_name] = idx < 3;

      for (const col of sheet.columns) {
        allCols.push({
          ...col,
          checked: false,
        });
      }
    });

    setSheetOrder(order);
    setSheetMetaByName(metaMap);
    setAvailableColumns(allCols);
    setSelectedColumns([]);
    setSearchQuery('');
    setOpenAvailableSheets(initialOpen);
    setOpenSelectedSheets({});
  }, []);

  const toggleAvailableColumn = useCallback((columnId) => {
    setAvailableColumns((prev) =>
      prev.map((col) =>
        col.id === columnId ? { ...col, checked: !col.checked } : col
      )
    );
  }, []);

  const toggleSelectedColumn = useCallback((columnId) => {
    setSelectedColumns((prev) =>
      prev.map((col) =>
        col.id === columnId ? { ...col, checked: !col.checked } : col
      )
    );
  }, []);

  const toggleAvailableSheetCheckAll = useCallback(
    (sheetName) => {
      setAvailableColumns((prev) => {
        const normalized = searchQuery.trim().toLowerCase();
        const matchingInSheet = prev.filter(
          (col) =>
            col.sheet === sheetName &&
            (!normalized ||
              col.name.toLowerCase().includes(normalized) ||
              col.sheet.toLowerCase().includes(normalized))
        );
        if (matchingInSheet.length === 0) return prev;

        const allChecked = matchingInSheet.every((col) => col.checked);
        const targetIds = new Set(matchingInSheet.map((col) => col.id));

        return prev.map((col) =>
          targetIds.has(col.id) ? { ...col, checked: !allChecked } : col
        );
      });
    },
    [searchQuery]
  );

  const toggleSelectedSheetCheckAll = useCallback((sheetName) => {
    setSelectedColumns((prev) => {
      const inSheet = prev.filter((col) => col.sheet === sheetName);
      if (inSheet.length === 0) return prev;
      const allChecked = inSheet.every((col) => col.checked);
      return prev.map((col) =>
        col.sheet === sheetName ? { ...col, checked: !allChecked } : col
      );
    });
  }, []);

  const toggleAvailableSheet = useCallback((sheetName) => {
    setOpenAvailableSheets((prev) => ({
      ...prev,
      [sheetName]: !prev[sheetName],
    }));
  }, []);

  const toggleSelectedSheet = useCallback((sheetName) => {
    setOpenSelectedSheets((prev) => ({
      ...prev,
      [sheetName]: !(prev[sheetName] ?? true),
    }));
  }, []);

  const moveCheckedToSelected = useCallback(() => {
    const toMove = availableColumns
      .filter((col) => col.checked)
      .map((col) => ({ ...col, checked: false }));

    if (toMove.length === 0) return;

    setAvailableColumns((prev) => prev.filter((col) => !col.checked));
    setSelectedColumns((prev) => [...prev, ...toMove]);
    setOpenSelectedSheets((prev) => {
      const next = { ...prev };
      toMove.forEach((c) => {
        if (!(c.sheet in next)) next[c.sheet] = true;
      });
      return next;
    });
  }, [availableColumns]);

  const moveAllToSelected = useCallback(() => {
    if (availableColumns.length === 0) return;
    const toMove = availableColumns.map((col) => ({ ...col, checked: false }));
    setAvailableColumns([]);
    setSelectedColumns((prev) => [...prev, ...toMove]);
  }, [availableColumns]);

  const moveCheckedToAvailable = useCallback(() => {
    const toMove = selectedColumns
      .filter((col) => col.checked)
      .map((col) => ({ ...col, checked: false }));

    if (toMove.length === 0) return;

    setSelectedColumns((prev) => prev.filter((col) => !col.checked));
    setAvailableColumns((prev) => [...prev, ...toMove]);
  }, [selectedColumns]);

  const moveAllToAvailable = useCallback(() => {
    if (selectedColumns.length === 0) return;
    const toMove = selectedColumns.map((col) => ({ ...col, checked: false }));
    setSelectedColumns([]);
    setAvailableColumns((prev) => [...prev, ...toMove]);
  }, [selectedColumns]);

  const filteredAvailableColumns = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    if (!normalized) return availableColumns;

    return availableColumns.filter(
      (col) =>
        col.name.toLowerCase().includes(normalized) ||
        col.sheet.toLowerCase().includes(normalized)
    );
  }, [availableColumns, searchQuery]);

  const groupedAvailable = useMemo(
    () => groupColumnsByOrderedSheets(filteredAvailableColumns, sheetOrder),
    [filteredAvailableColumns, sheetOrder]
  );

  const groupedSelected = useMemo(
    () => groupColumnsByOrderedSheets(selectedColumns, sheetOrder),
    [selectedColumns, sheetOrder]
  );

  const checkedAvailableCount = useMemo(
    () => availableColumns.filter((col) => col.checked).length,
    [availableColumns]
  );

  const checkedSelectedCount = useMemo(
    () => selectedColumns.filter((col) => col.checked).length,
    [selectedColumns]
  );

  const selectedSheetsCount = useMemo(
    () => new Set(selectedColumns.map((col) => col.sheet)).size,
    [selectedColumns]
  );

  const buildPreviewSelections = useCallback(
    () =>
      groupedSelected.map(({ sheet, columns }) => ({
        sheet_name: sheet,
        columns: columns.map((c) => c.name),
      })),
    [groupedSelected]
  );

  return {
    sheetOrder,
    sheetMetaByName,
    availableColumns,
    selectedColumns,
    groupedAvailable,
    groupedSelected,
    searchQuery,
    setSearchQuery,
    openAvailableSheets,
    openSelectedSheets,
    initFromUpload,
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
    selectedSheetsCount,
    buildPreviewSelections,
  };
}
