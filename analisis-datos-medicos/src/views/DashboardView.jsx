import { useRef, useState } from 'react';
import {
  BarChart2,
  PieChart as PieChartIcon,
  TrendingUp,
  ChevronDown,
  FileSpreadsheet,
  Download,
  AlertCircle,
  Check,
  Upload,
  Loader2,
  MousePointerClick,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
  PieChart,
  Pie,
  LineChart,
  Line,
} from 'recharts';

const CHART_MENUS = [
  {
    id: 'pie',
    kicker: 'OPCIÓN 1',
    label: 'Gráfica Pastel',
    icon: PieChartIcon,
  },
  {
    id: 'bar',
    kicker: 'OPCIÓN 2',
    label: 'Gráfica de Barras',
    icon: BarChart2,
  },
  {
    id: 'line',
    kicker: 'OPCIÓN 3',
    label: 'Tendencia / Líneas',
    icon: TrendingUp,
  },
];

const SHORT_TYPE_LABELS = {
  numeric: 'Num',
  categorical: 'Cat',
  date: 'Fecha',
  compound_ratio: 'Ratio',
  text_id: 'Texto',
};

function CustomChartTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  const itemName = label || entry?.name || entry?.payload?.name;

  return (
    <div className="bg-white border border-[#c9dceb] rounded-lg px-3 py-2 shadow-sm text-xs">
      {itemName && (
        <p className="font-semibold text-[#10263c] mb-1">{itemName}</p>
      )}
      <p className="text-[#23415e]">
        Valor:{' '}
        <span className="font-semibold text-[#10263c]">{entry?.value}</span>
        {entry?.payload?.percentage ? ` (${entry.payload.percentage})` : ''}
      </p>
    </div>
  );
}

function KpiCard({ label, value, detail }) {
  return (
    <div className="bg-white rounded-xl border border-[#c9dceb] p-5 shadow-sm">
      <p className="text-xs font-medium text-[#56748d]">{label}</p>
      <p className="text-2xl sm:text-3xl font-bold text-[#10263c] mt-2 tracking-tight truncate">
        {value}
      </p>
      <p className="text-xs text-[#56748d] mt-1.5 truncate">{detail}</p>
    </div>
  );
}

function DynamicChartRenderer({ chartData }) {
  const { chart_type, data, x_label, y_label } = chartData;

  if (chart_type === 'pie') {
    const totalSum = data.reduce((acc, item) => acc + (Number(item.value) || 0), 0);

    return (
      <div className="bg-white rounded-2xl border border-[#c9dceb] p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row items-center gap-8">
          <div className="relative w-full lg:w-1/2 h-[270px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={108}
                  paddingAngle={2}
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                >
                  {data.map((entry, idx) => (
                    <Cell
                      key={`${entry.name}-${idx}`}
                      fill={entry.color || '#1d5b90'}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>

            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-3xl font-bold text-[#10263c] leading-none">
                {totalSum}
              </span>
              <span className="text-xs text-[#56748d] mt-1">registros</span>
            </div>
          </div>

          <div className="w-full lg:w-1/2 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {data.map((item, idx) => (
              <div
                key={`${item.name}-${idx}`}
                className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#f5f9fd] border border-[#cfe0ed]"
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0 mt-1"
                  style={{ backgroundColor: item.color || '#1d5b90' }}
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#10263c] truncate">
                    {item.name}
                  </p>
                  <p className="text-xs text-[#56748d] mt-0.5">
                    {item.value} · {item.percentage}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (chart_type === 'line') {
    return (
      <div className="bg-white rounded-2xl border border-[#c9dceb] p-6 shadow-sm">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart
            data={data}
            margin={{ top: 20, right: 20, left: 0, bottom: 12 }}
          >
            <CartesianGrid vertical={false} stroke="#cfe0ed" />
            <XAxis
              dataKey="name"
              axisLine={{ stroke: '#cfe0ed' }}
              tickLine={false}
              tick={{ fill: '#56748d', fontSize: 12 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#56748d', fontSize: 12 }}
            />
            <Tooltip content={<CustomChartTooltip />} />
            <Line
              type="monotone"
              dataKey="value"
              name={y_label}
              stroke="#1d5b90"
              strokeWidth={2.5}
              dot={{ r: 4, fill: '#1d5b90' }}
              activeDot={{ r: 6, fill: '#123b61' }}
            />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-xs text-[#56748d] text-center mt-2">{x_label}</p>
      </div>
    );
  }

  // Default: bar chart
  return (
    <div className="bg-white rounded-2xl border border-[#c9dceb] p-6 shadow-sm">
      <ResponsiveContainer width="100%" height={320}>
        <BarChart
          data={data}
          margin={{ top: 24, right: 16, left: 0, bottom: 12 }}
        >
          <CartesianGrid vertical={false} stroke="#cfe0ed" />
          <XAxis
            dataKey="name"
            axisLine={{ stroke: '#cfe0ed' }}
            tickLine={false}
            tick={{ fill: '#56748d', fontSize: 12 }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#56748d', fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: '#f4f8fc' }}
            content={<CustomChartTooltip />}
          />
          <Bar
            dataKey="value"
            name={y_label}
            radius={[6, 6, 0, 0]}
            maxBarSize={56}
          >
            {data.map((entry, idx) => (
              <Cell
                key={`${entry.name}-${idx}`}
                fill={entry.highlight ? '#1d5b90' : '#72a4cf'}
              />
            ))}
            <LabelList
              dataKey="value"
              position="top"
              fill="#10263c"
              fontSize={12}
              fontWeight={600}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-[#56748d] text-center mt-2">{x_label}</p>
    </div>
  );
}

export function DashboardView({
  fileInfo,
  groupedSelected,
  selectedColumnsCount,
  activeChartMenu,
  onToggleChartMenu,
  selectedChartTarget,
  chartData,
  isLoadingChart,
  chartError,
  onSelectChartColumn,
  onResetToUpload,
}) {
  const [exported, setExported] = useState(false);
  const chartWrapperRef = useRef(null);

  const handleExportPng = () => {
    if (!chartData) return;

    const svgEl = chartWrapperRef.current?.querySelector('svg');
    if (!svgEl) return;

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgEl);
    const svgBlob = new Blob([svgString], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();

    img.onload = () => {
      const rect = svgEl.getBoundingClientRect();
      const width = Math.max(rect.width || 800, 600);
      const height = Math.max(rect.height || 360, 320);

      const canvas = document.createElement('canvas');
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext('2d');
      ctx.scale(2, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      URL.revokeObjectURL(url);

      const pngUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = pngUrl;
      link.download = `${chartData.chart_type}_${selectedChartTarget?.column || 'grafico'}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setExported(true);
      setTimeout(() => setExported(false), 2000);
    };

    img.src = url;
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row">
      {/* Sidebar Izquierdo */}
      <aside className="w-full md:w-72 shrink-0 bg-white border-b md:border-b-0 md:border-r border-[#cfe0ed] flex flex-col justify-between p-5 md:min-h-[calc(100vh-4rem)]">
        <div>
          <div className="px-1">
            <h2 className="text-base font-bold text-[#10263c]">
              Vistas de Análisis
            </h2>
            <p className="text-xs text-[#56748d] mt-0.5">
              Despliega un gráfico y elige una columna
            </p>
          </div>

          <nav aria-label="Menú de gráficos" className="mt-5 space-y-2">
            {CHART_MENUS.map((menu) => {
              const Icon = menu.icon;
              const isExpanded = activeChartMenu === menu.id;

              return (
                <div key={menu.id}>
                  <button
                    type="button"
                    onClick={() =>
                      onToggleChartMenu(isExpanded ? null : menu.id)
                    }
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors ${
                      isExpanded
                        ? 'bg-[#e6f0fa] border-l-4 border-[#1d5b90] text-[#1d5b90] rounded-r-lg'
                        : 'text-[#23415e] hover:bg-[#f4f8fc] rounded-lg border-l-4 border-transparent'
                    }`}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isExpanded ? 'text-[#1d5b90]' : 'text-[#56748d]'
                        }`}
                        strokeWidth={2}
                      />
                      <span className="min-w-0">
                        <span
                          className={`block text-[10px] font-semibold uppercase tracking-wider ${
                            isExpanded ? 'text-[#1d5b90]' : 'text-[#56748d]'
                          }`}
                        >
                          {menu.kicker}
                        </span>
                        <span
                          className={`block text-sm truncate ${
                            isExpanded
                              ? 'font-semibold text-[#1d5b90]'
                              : 'font-medium text-[#23415e]'
                          }`}
                        >
                          {menu.label}
                        </span>
                      </span>
                    </span>

                    <ChevronDown
                      className={`w-4 h-4 shrink-0 transition-transform ${
                        isExpanded
                          ? 'rotate-0 text-[#1d5b90]'
                          : '-rotate-90 text-[#56748d]'
                      }`}
                    />
                  </button>

                  {isExpanded && (
                    <div className="mt-1.5 bg-white border border-[#c9dceb] rounded-xl p-2.5 max-h-72 overflow-y-auto custom-scrollbar space-y-2.5">
                      {groupedSelected.map(({ sheet, columns }) => (
                        <div key={`${menu.id}-${sheet}`}>
                          <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#56748d] truncate">
                            {sheet}
                          </p>
                          <ul className="space-y-1 mt-0.5">
                            {columns.map((col) => {
                              const isSelectedCol =
                                selectedChartTarget?.chartType === menu.id &&
                                selectedChartTarget?.sheetName === sheet &&
                                selectedChartTarget?.column === col.name;

                              return (
                                <li key={`${menu.id}-${col.id}`}>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onSelectChartColumn({
                                        chartType: menu.id,
                                        sheetName: sheet,
                                        column: col.name,
                                      })
                                    }
                                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors ${
                                      isSelectedCol
                                        ? 'bg-[#e6f0fa] text-[#1d5b90] font-semibold'
                                        : 'text-[#23415e] hover:bg-[#f4f8fc]'
                                    }`}
                                  >
                                    <span className="truncate">{col.name}</span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#f5f9fd] border border-[#cfe0ed] text-[#56748d] shrink-0">
                                      {SHORT_TYPE_LABELS[col.inferred_type] || 'Col'}
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        <div className="mt-6">
          <div className="bg-[#f5f9fd] border border-[#cfe0ed] rounded-xl p-4">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-[#56748d]">
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#1d5b90]" />
              <span>ARCHIVO ACTUAL</span>
            </div>
            <p className="text-sm font-semibold text-[#10263c] mt-1.5 truncate">
              {fileInfo.name}
            </p>
            <p className="text-xs text-[#56748d] mt-0.5">
              {fileInfo.totalRecords} registros · {selectedColumnsCount}{' '}
              {selectedColumnsCount === 1 ? 'columna' : 'columnas'}
            </p>
          </div>

          <button
            type="button"
            onClick={onResetToUpload}
            className="mt-2.5 w-full bg-white border border-[#c9dceb] text-[#1d5b90] hover:bg-[#f4f8fc] text-xs font-medium py-2 px-3 rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Cargar otro archivo</span>
          </button>
        </div>
      </aside>

      {/* Área Principal */}
      <div className="flex-1 bg-[#edf5fb] p-6 sm:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          {!chartData && !isLoadingChart && !chartError && (
            <div className="min-h-[60vh] flex items-center justify-center">
              <div className="bg-white rounded-2xl border border-[#c9dceb] p-10 text-center max-w-md w-full shadow-card">
                <div className="w-12 h-12 mx-auto rounded-xl bg-[#e6f0fa] text-[#1d5b90] flex items-center justify-center">
                  <MousePointerClick className="w-6 h-6" strokeWidth={1.8} />
                </div>
                <h1 className="text-xl font-bold text-[#10263c] mt-4">
                  Seleccione una opción para visualizar el gráfico
                </h1>
                <p className="text-sm text-[#56748d] mt-2">
                  Expande un tipo de gráfico en el panel izquierdo y haz clic en
                  cualquiera de tus columnas seleccionadas para generar el análisis automáticamente.
                </p>
              </div>
            </div>
          )}

          {isLoadingChart && (
            <div className="min-h-[60vh] flex items-center justify-center">
              <div className="bg-white rounded-2xl border border-[#c9dceb] p-10 text-center max-w-md w-full shadow-card">
                <Loader2 className="w-8 h-8 text-[#1d5b90] animate-spin mx-auto" />
                <p className="text-sm font-semibold text-[#10263c] mt-4">
                  Calculando KPIs y generando gráfico...
                </p>
                <p className="text-xs text-[#56748d] mt-1">
                  Procesando registros limpios de la columna seleccionada
                </p>
              </div>
            </div>
          )}

          {chartError && !isLoadingChart && (
            <div className="bg-[#f5f9fd] border border-[#1d5b90] rounded-xl p-5 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[#1d5b90] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-[#10263c]">
                  No se pudo generar el gráfico
                </p>
                <p className="text-xs text-[#23415e] mt-1">{chartError}</p>
              </div>
            </div>
          )}

          {chartData && !isLoadingChart && (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#1d5b90]">
                    DASHBOARD
                  </p>
                  <h1 className="text-2xl sm:text-3xl font-bold text-[#10263c] mt-1">
                    {chartData.title}
                  </h1>
                  <p className="text-sm text-[#56748d] mt-1">
                    {chartData.subtitle}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleExportPng}
                  className="bg-[#1d5b90] hover:bg-[#123b61] text-white px-5 py-2.5 rounded-lg font-medium text-sm inline-flex items-center gap-2 transition-colors shadow-sm"
                >
                  {exported ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>PNG exportado</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Exportar gráfico</span>
                    </>
                  )}
                </button>
              </div>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {chartData.kpis.map((kpi) => (
                  <KpiCard
                    key={kpi.label}
                    label={kpi.label}
                    value={kpi.value}
                    detail={kpi.detail}
                  />
                ))}
              </div>

              <div ref={chartWrapperRef} className="mt-6">
                <DynamicChartRenderer chartData={chartData} />
              </div>

              <div className="mt-6 bg-[#e6f0fa] border border-[#c9dceb] rounded-xl p-5 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-[#1d5b90] shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-[#10263c]">
                    {chartData.insight.headline}
                  </p>
                  <p className="text-xs text-[#23415e]">
                    {chartData.insight.detail}
                  </p>
                  {chartData.warnings?.length > 0 && (
                    <ul className="pt-1 space-y-0.5 text-xs text-[#56748d] list-disc list-inside">
                      {chartData.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
