# Cómo ejecutar el prototipo

## Requisitos

- **Python 3.10 o superior** (al instalarlo, marcar "Add Python to PATH").
- Librerías:

| Librería   | Para qué sirve                          |
|------------|-----------------------------------------|
| flask      | Servidor web                            |
| pandas     | Leer y analizar el Excel                |
| numpy      | Cálculos                                |
| openpyxl   | Abrir archivos .xlsx                    |
| defusedxml | Seguridad al leer el Excel              |
| waitress   | Servidor estable para Windows           |

Instalarlas (PowerShell, una sola vez):

```powershell
python -m pip install flask pandas numpy openpyxl defusedxml waitress
```

## Ejecutar

1. Doble clic en **`iniciar.bat`**.
2. Se abre el navegador en **http://127.0.0.1:5000**.
3. No cerrar la ventana negra mientras se usa la página.

Para probar sin un Excel propio: botón **"Usar datos de demostración"** o cargar `ejemplo_datos.xlsx`.
