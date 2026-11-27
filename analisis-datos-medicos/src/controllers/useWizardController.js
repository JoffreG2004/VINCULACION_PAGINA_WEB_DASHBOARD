import { useState, useCallback } from 'react';
import {
  uploadExcel,
  fetchPreview,
  fetchChartData,
} from '../services/excelApi';

const PREVIEW_PAGE_LIMIT = 50;

/**
 * Controlador principal del asistente (Pasos 1-4), integración API y vista del Dashboard.
 */
export function useWizardController() {
  const [currentStep, setCurrentStep] = useState(1);
  const [fileId, setFileId] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const [previewData, setPreviewData] = useState(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [loadingMoreSheet, setLoadingMoreSheet] = useState(null);
  const [previewError, setPreviewError] = useState('');

  const [activeChartMenu, setActiveChartMenu] = useState(null);
  const [selectedChartTarget, setSelectedChartTarget] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [isLoadingChart, setIsLoadingChart] = useState(false);
  const [chartError, setChartError] = useState('');

  const goToStep = useCallback((step) => {
    if (step >= 1 && step <= 4) {
      setCurrentStep(step);
    }
  }, []);

  const prevStep = useCallback(() => {
    setCurrentStep((prev) => Math.max(1, prev - 1));
  }, []);

  const handleFileUpload = useCallback(async (file, onParsedCallback) => {
    if (!file) return;
    setIsUploading(true);
    setUploadError('');

    try {
      const response = await uploadExcel(file);
      setFileId(response.file_id);
      setFileInfo({
        name: response.file_name,
        totalSheets: response.total_sheets,
        totalColumns: response.total_columns,
        totalRecords: response.total_records,
        sheets: response.sheets,
      });
      setPreviewData(null);
      setChartData(null);
      setSelectedChartTarget(null);
      setActiveChartMenu(null);

      if (onParsedCallback) {
        onParsedCallback(response.sheets);
      }
      setCurrentStep(2);
    } catch (error) {
      setUploadError(
        error?.message ||
          'No se pudo procesar el archivo. Verifica que el backend esté activo.'
      );
    } finally {
      setIsUploading(false);
    }
  }, []);

  const loadPreviewAndAdvance = useCallback(
    async (selections) => {
      if (!fileId || !selections || selections.length === 0) return;
      setIsLoadingPreview(true);
      setPreviewError('');

      try {
        const response = await fetchPreview(
          fileId,
          selections,
          PREVIEW_PAGE_LIMIT,
          0
        );
        setPreviewData(response);
        setCurrentStep(3);
      } catch (error) {
        setPreviewError(
          error?.message || 'Error al obtener la previsualización de datos.'
        );
      } finally {
        setIsLoadingPreview(false);
      }
    },
    [fileId]
  );

  const loadMorePreviewRows = useCallback(
    async (sheetName, columns) => {
      if (!fileId || !previewData) return;
      const targetSheet = previewData.sheets_preview.find(
        (s) => s.sheet_name === sheetName
      );
      if (!targetSheet || !targetSheet.has_more) return;

      setLoadingMoreSheet(sheetName);
      try {
        const nextOffset = targetSheet.rows.length;
        const response = await fetchPreview(
          fileId,
          [{ sheet_name: sheetName, columns }],
          PREVIEW_PAGE_LIMIT,
          nextOffset
        );
        const updatedSheet = response.sheets_preview[0];
        if (!updatedSheet) return;

        setPreviewData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            sheets_preview: prev.sheets_preview.map((s) =>
              s.sheet_name === sheetName
                ? {
                    ...s,
                    rows: [...s.rows, ...updatedSheet.rows],
                    returned_rows: s.rows.length + updatedSheet.rows.length,
                    has_more: updatedSheet.has_more,
                  }
                : s
            ),
          };
        });
      } catch (error) {
        setPreviewError(
          error?.message || 'No se pudieron cargar más registros.'
        );
      } finally {
        setLoadingMoreSheet(null);
      }
    },
    [fileId, previewData]
  );

  const generateDashboard = useCallback(() => {
    setChartData(null);
    setChartError('');
    setSelectedChartTarget(null);
    setActiveChartMenu('pie');
    setCurrentStep(4);
  }, []);

  const selectChartColumn = useCallback(
    async ({
      chartType,
      sheetName,
      column,
      secondaryColumn = null,
      aggregation = 'count',
      compareSheets = null,
    }) => {
      if (!fileId) return;
      setIsLoadingChart(true);
      setChartError('');
      setSelectedChartTarget({
        chartType,
        sheetName,
        column,
        secondaryColumn,
        aggregation,
        compareSheets,
      });

      try {
        const response = await fetchChartData({
          file_id: fileId,
          chart_type: chartType,
          sheet_name: sheetName,
          column,
          secondary_column: secondaryColumn,
          aggregation,
          compare_sheets: compareSheets,
        });
        setChartData(response);
      } catch (error) {
        setChartError(
          error?.message || 'No se pudo generar el gráfico solicitado.'
        );
      } finally {
        setIsLoadingChart(false);
      }
    },
    [fileId]
  );

  const resetToUpload = useCallback(() => {
    setFileId(null);
    setFileInfo(null);
    setPreviewData(null);
    setChartData(null);
    setSelectedChartTarget(null);
    setActiveChartMenu(null);
    setUploadError('');
    setPreviewError('');
    setChartError('');
    setCurrentStep(1);
  }, []);

  return {
    currentStep,
    fileId,
    fileInfo,
    isUploading,
    uploadError,
    previewData,
    isLoadingPreview,
    loadingMoreSheet,
    previewError,
    activeChartMenu,
    setActiveChartMenu,
    selectedChartTarget,
    chartData,
    isLoadingChart,
    chartError,
    goToStep,
    prevStep,
    handleFileUpload,
    loadPreviewAndAdvance,
    loadMorePreviewRows,
    generateDashboard,
    selectChartColumn,
    resetToUpload,
  };
}
