import { useWizardController } from './controllers/useWizardController';
import { useColumnSelection } from './controllers/useColumnSelection';
import { MainLayout } from './views/layout/MainLayout';
import { UploadView } from './views/UploadView';
import { SelectColumnsView } from './views/SelectColumnsView';
import { PreviewDataView } from './views/PreviewDataView';
import { DashboardView } from './views/DashboardView';

export function App() {
  const wizard = useWizardController();
  const columnSelection = useColumnSelection();

  const onFileUpload = (file) => {
    wizard.handleFileUpload(file, columnSelection.initFromUpload);
  };

  const onNextFromColumns = () => {
    const selections = columnSelection.buildPreviewSelections();
    wizard.loadPreviewAndAdvance(selections);
  };

  return (
    <MainLayout currentStep={wizard.currentStep}>
      {wizard.currentStep === 1 && (
        <UploadView
          onFileUpload={onFileUpload}
          isUploading={wizard.isUploading}
          uploadError={wizard.uploadError}
        />
      )}

      {wizard.currentStep === 2 && wizard.fileInfo && (
        <SelectColumnsView
          fileInfo={wizard.fileInfo}
          columnState={columnSelection}
          isLoadingPreview={wizard.isLoadingPreview}
          previewError={wizard.previewError}
          onBack={wizard.prevStep}
          onNext={onNextFromColumns}
        />
      )}

      {wizard.currentStep === 3 && wizard.fileInfo && (
        <PreviewDataView
          fileInfo={wizard.fileInfo}
          previewData={wizard.previewData}
          loadingMoreSheet={wizard.loadingMoreSheet}
          onLoadMore={wizard.loadMorePreviewRows}
          onBack={wizard.prevStep}
          onGenerateDashboard={wizard.generateDashboard}
        />
      )}

      {wizard.currentStep === 4 && wizard.fileInfo && (
        <DashboardView
          fileInfo={wizard.fileInfo}
          groupedSelected={columnSelection.groupedSelected}
          selectedColumnsCount={columnSelection.selectedColumns.length}
          activeChartMenu={wizard.activeChartMenu}
          onToggleChartMenu={wizard.setActiveChartMenu}
          selectedChartTarget={wizard.selectedChartTarget}
          chartData={wizard.chartData}
          isLoadingChart={wizard.isLoadingChart}
          chartError={wizard.chartError}
          onSelectChartColumn={wizard.selectChartColumn}
          onResetToUpload={wizard.resetToUpload}
        />
      )}
    </MainLayout>
  );
}

export default App;
