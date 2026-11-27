import { useRef, useState } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Lock,
  Loader2,
  AlertCircle,
} from 'lucide-react';

export function UploadView({ onFileUpload, isUploading, uploadError }) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileChosen = (file) => {
    if (!file || isUploading) return;
    onFileUpload(file);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    if (!isUploading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    const droppedFile = event.dataTransfer?.files?.[0];
    handleFileChosen(droppedFile);
  };

  const handleInputChange = (event) => {
    const pickedFile = event.target.files?.[0];
    handleFileChosen(pickedFile);
    event.target.value = '';
  };

  return (
    <section className="flex-1 flex flex-col items-center justify-center px-6 pb-12">
      <div className="max-w-2xl w-full mx-auto bg-white rounded-2xl border border-[#c9dceb] p-8 sm:p-10 shadow-card">
        <div className="text-center">
          <p className="text-xs font-semibold tracking-wider uppercase text-[#1d5b90]">
            COMIENZA TU ANÁLISIS
          </p>
          <h1 className="text-3xl font-bold text-[#10263c] mt-2">
            Análisis de datos médicos
          </h1>
          <p className="text-sm text-[#56748d] mt-2">
            Carga tu archivo Excel para detectar automáticamente hojas, columnas y tipos de datos
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.xlsm"
          onChange={handleInputChange}
          className="hidden"
          aria-label="Seleccionar archivo Excel"
        />

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`mt-8 border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
            isUploading
              ? 'bg-[#e6f0fa] border-[#1d5b90]'
              : isDragging
                ? 'bg-[#e6f0fa] border-[#1d5b90]'
                : 'bg-[#f4f8fc] border-[#72a4cf] hover:bg-[#e6f0fa]'
          }`}
        >
          <div className="w-12 h-12 mx-auto rounded-xl bg-[#e6f0fa] text-[#1d5b90] flex items-center justify-center">
            {isUploading ? (
              <Loader2 className="w-6 h-6 animate-spin" strokeWidth={2} />
            ) : (
              <FileSpreadsheet className="w-6 h-6" strokeWidth={1.9} />
            )}
          </div>

          {isUploading ? (
            <div className="mt-5">
              <p className="text-sm font-semibold text-[#10263c]">
                Analizando hojas y columnas...
              </p>
              <p className="text-xs text-[#56748d] mt-1">
                Detectando encabezados, limpiando textos y perfilando tipos de datos
              </p>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-5 bg-[#1d5b90] hover:bg-[#123b61] text-white font-medium text-sm px-6 py-2.5 rounded-lg inline-flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
              >
                <Upload className="w-4 h-4" strokeWidth={2} />
                <span>Seleccionar archivo Excel</span>
              </button>

              <p className="text-sm text-[#23415e] mt-3">
                o arrastra y suelta tu archivo .xlsx o .xls aquí
              </p>
              <p className="text-xs text-[#56748d] mt-1">
                Formatos compatibles: .xlsx, .xls
              </p>
            </>
          )}
        </div>

        {uploadError && (
          <div className="mt-5 bg-[#f5f9fd] border border-[#1d5b90] rounded-xl p-4 flex items-start gap-2.5 text-left">
            <AlertCircle className="w-4 h-4 text-[#1d5b90] shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-[#10263c]">
                No se pudo cargar el archivo
              </p>
              <p className="text-xs text-[#23415e] mt-0.5">{uploadError}</p>
            </div>
          </div>
        )}

        <div className="mt-7 flex justify-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#f5f9fd] border border-[#cfe0ed] text-xs text-[#23415e]">
            <Lock className="w-3.5 h-3.5 text-[#56748d]" strokeWidth={2} />
            <span>Procesamiento seguro y confidencial</span>
          </div>
        </div>
      </div>

      <p className="mt-6 text-xs text-[#56748d] text-center">
        De tus datos a decisiones más informadas, en cuatro pasos.
      </p>
    </section>
  );
}
