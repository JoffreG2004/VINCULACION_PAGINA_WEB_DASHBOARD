const API_BASE_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || '';

async function parseErrorResponse(response) {
  try {
    const data = await response.json();
    if (typeof data?.detail === 'string') {
      return data.detail;
    }
    if (Array.isArray(data?.detail)) {
      return data.detail.map((d) => d.msg || JSON.stringify(d)).join(', ');
    }
  } catch {
    // Ignore JSON parse errors
  }
  return `Error del servidor (${response.status})`;
}

export async function uploadExcel(file) {
  const formData = new FormData();
  formData.append('file', file);

  // No establecer Content-Type manualmente para que el navegador agregue el boundary correcto
  const response = await fetch(`${API_BASE_URL}/api/excel/inspect`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  return response.json();
}

export async function fetchPreview(fileId, selections, limit = 50, offset = 0) {
  const response = await fetch(`${API_BASE_URL}/api/excel/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_id: fileId,
      selections,
      limit,
      offset,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  return response.json();
}

export async function fetchChartData(payload) {
  const response = await fetch(`${API_BASE_URL}/api/excel/chart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  return response.json();
}
