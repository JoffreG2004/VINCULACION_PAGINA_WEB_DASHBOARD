export const MOCK_FILE_INFO = {
  name: 'Datos_Pacientes_2026.xlsx',
  totalSheets: 2,
  totalColumns: 12,
  totalRecords: 450,
};

export const INITIAL_AVAILABLE_COLUMNS = [
  { id: 'sexo', name: 'sexo', sheet: 'Hoja 1', checked: true },
  { id: 'telefono', name: 'telefono', sheet: 'Hoja 1', checked: false },
  { id: 'codigo_postal', name: 'codigo_postal', sheet: 'Hoja 1', checked: false },
  { id: 'medico_responsable', name: 'medico_responsable', sheet: 'Hoja 2', checked: false },
  { id: 'observaciones', name: 'observaciones', sheet: 'Hoja 2', checked: false },
];

export const INITIAL_SELECTED_COLUMNS = [
  { id: 'id_paciente', name: 'id_paciente', sheet: 'Hoja 1', checked: false },
  { id: 'edad', name: 'edad', sheet: 'Hoja 1', checked: false },
  { id: 'diagnostico', name: 'diagnostico', sheet: 'Hoja 1', checked: false },
  { id: 'fecha_ingreso', name: 'fecha_ingreso', sheet: 'Hoja 1', checked: false },
  { id: 'tratamiento', name: 'tratamiento', sheet: 'Hoja 2', checked: false },
  { id: 'estado', name: 'estado', sheet: 'Hoja 2', checked: false },
  { id: 'fecha_alta', name: 'fecha_alta', sheet: 'Hoja 2', checked: false },
];

export const MOCK_PREVIEW_ROWS = [
  { id: 'PAC-001', edad: 62, diagnostico: 'Hipertensión', ingreso: '03/01/2026', tratamiento: 'Control farmacológico', estado: 'Alta', alta: '08/01/2026' },
  { id: 'PAC-002', edad: 34, diagnostico: 'Asma', ingreso: '05/01/2026', tratamiento: 'Terapia inhalada', estado: 'Seguimiento', alta: '—' },
  { id: 'PAC-003', edad: 48, diagnostico: 'Diabetes tipo 2', ingreso: '07/01/2026', tratamiento: 'Control metabólico', estado: 'Seguimiento', alta: '—' },
  { id: 'PAC-004', edad: 27, diagnostico: 'Asma', ingreso: '09/01/2026', tratamiento: 'Terapia inhalada', estado: 'Alta', alta: '12/01/2026' },
  { id: 'PAC-005', edad: 71, diagnostico: 'Hipertensión', ingreso: '11/01/2026', tratamiento: 'Control farmacológico', estado: 'Seguimiento', alta: '—' },
  { id: 'PAC-006', edad: 53, diagnostico: 'Diabetes tipo 2', ingreso: '14/01/2026', tratamiento: 'Control metabólico', estado: 'Alta', alta: '19/01/2026' },
  { id: 'PAC-007', edad: 16, diagnostico: 'Asma', ingreso: '16/01/2026', tratamiento: 'Terapia inhalada', estado: 'Alta', alta: '20/01/2026' },
  { id: 'PAC-008', edad: 45, diagnostico: 'Hipertensión', ingreso: '18/01/2026', tratamiento: 'Control farmacológico', estado: 'Seguimiento', alta: '—' },
  { id: 'PAC-009', edad: 39, diagnostico: 'Otros', ingreso: '21/01/2026', tratamiento: 'Observación clínica', estado: 'Alta', alta: '24/01/2026' },
  { id: 'PAC-010', edad: 58, diagnostico: 'Diabetes tipo 2', ingreso: '23/01/2026', tratamiento: 'Control metabólico', estado: 'Seguimiento', alta: '—' },
];

export const COLUMN_DISPLAY_CONFIG = {
  id_paciente: { label: 'ID paciente', key: 'id' },
  edad: { label: 'Edad', key: 'edad' },
  diagnostico: { label: 'Diagnóstico', key: 'diagnostico' },
  fecha_ingreso: { label: 'Fecha de ingreso', key: 'ingreso' },
  tratamiento: { label: 'Tratamiento', key: 'tratamiento' },
  estado: { label: 'Estado', key: 'estado' },
  fecha_alta: { label: 'Fecha de alta', key: 'alta' },
  sexo: { label: 'Sexo', key: 'sexo' },
  telefono: { label: 'Teléfono', key: 'telefono' },
  codigo_postal: { label: 'Código postal', key: 'codigo_postal' },
  medico_responsable: { label: 'Médico responsable', key: 'medico_responsable' },
  observaciones: { label: 'Observaciones', key: 'observaciones' },
};

export const EXTRA_COLUMN_VALUES = {
  'PAC-001': { sexo: 'M', telefono: '099-412-8810', codigo_postal: '170135', medico_responsable: 'Dra. Morales', observaciones: 'Control estable' },
  'PAC-002': { sexo: 'F', telefono: '098-334-1290', codigo_postal: '170104', medico_responsable: 'Dr. Paredes', observaciones: 'Revisión en 15 días' },
  'PAC-003': { sexo: 'M', telefono: '099-771-4502', codigo_postal: '170518', medico_responsable: 'Dra. Viteri', observaciones: 'Dieta supervisada' },
  'PAC-004': { sexo: 'F', telefono: '097-612-3094', codigo_postal: '170150', medico_responsable: 'Dr. Paredes', observaciones: 'Sin complicaciones' },
  'PAC-005': { sexo: 'M', telefono: '098-902-7741', codigo_postal: '170129', medico_responsable: 'Dra. Morales', observaciones: 'Monitoreo ambulatorio' },
  'PAC-006': { sexo: 'F', telefono: '099-550-2188', codigo_postal: '170403', medico_responsable: 'Dra. Viteri', observaciones: 'Evolución favorable' },
  'PAC-007': { sexo: 'M', telefono: '096-845-9912', codigo_postal: '170142', medico_responsable: 'Dr. Paredes', observaciones: 'Alta pediátrica' },
  'PAC-008': { sexo: 'F', telefono: '098-119-6430', codigo_postal: '170201', medico_responsable: 'Dra. Morales', observaciones: 'Ajuste de dosis' },
  'PAC-009': { sexo: 'M', telefono: '099-308-5567', codigo_postal: '170135', medico_responsable: 'Dr. León', observaciones: 'Egreso sin novedad' },
  'PAC-010': { sexo: 'F', telefono: '097-420-1185', codigo_postal: '170520', medico_responsable: 'Dra. Viteri', observaciones: 'Pendiente laboratorio' },
};

export const MOCK_AGE_DISTRIBUTION = [
  { range: '0–17', count: 36, highlight: false },
  { range: '18–29', count: 81, highlight: false },
  { range: '30–44', count: 117, highlight: false },
  { range: '45–64', count: 144, highlight: true },
  { range: '65+', count: 72, highlight: false },
];

export const MOCK_DIAGNOSES_DATA = [
  { name: 'Hipertensión', value: 171, percentage: '38 %', color: '#1d5b90' },
  { name: 'Diabetes tipo 2', value: 117, percentage: '26 %', color: '#4a82b5' },
  { name: 'Asma', value: 90, percentage: '20 %', color: '#72a4cf' },
  { name: 'Otros', value: 72, percentage: '16 %', color: '#aec3d3' },
];

export const MOCK_MONTHLY_TREND = [
  { month: 'Ago', ingresos: 58, altas: 49 },
  { month: 'Sep', ingresos: 64, altas: 56 },
  { month: 'Oct', ingresos: 72, altas: 61 },
  { month: 'Nov', ingresos: 80, altas: 70 },
  { month: 'Dic', ingresos: 84, altas: 74 },
  { month: 'Ene', ingresos: 92, altas: 81 },
];

export const MOCK_TREATMENT_SUMMARY = [
  { name: 'Control farmacológico', pacientes: 171, estadoAlta: 108, seguimiento: 63 },
  { name: 'Control metabólico', pacientes: 117, estadoAlta: 72, seguimiento: 45 },
  { name: 'Terapia inhalada', pacientes: 90, estadoAlta: 64, seguimiento: 26 },
  { name: 'Observación clínica', pacientes: 72, estadoAlta: 51, seguimiento: 21 },
];
