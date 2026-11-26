# Panel de Análisis · Vinculación

Dashboard web que importa un Excel (.xlsx) o CSV, **elimina automáticamente los datos
personales** con Python y muestra solo indicadores agrupados.

## Cómo ejecutarlo (Windows)

Doble clic en `iniciar.bat` (crea el entorno, instala dependencias y abre el navegador).

O manualmente:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Abrir `http://127.0.0.1:5000`. Para probar, usa **Precargar datos de demostración** o
importa `ejemplo_datos.xlsx` (datos 100 % ficticios).

## Flujo

1. **Cargar archivo**: banner «Datos que cuidan» + zona para seleccionar o arrastrar el Excel.
2. **Seleccionar columnas**: columnas detectadas por hoja (con buscador) y botones » › « ‹ para
   pasarlas a la selección. Las columnas con datos personales **no aparecen**.
3. **Confirmar análisis**: resumen de las vistas que se generarán.
4. **Dashboard**: en la barra lateral, una vista por columna (rangos, categorías o tendencia
   mensual). Incluye indicadores, gráfico principal, gráfico circular, hallazgo,
   «Exportar gráfico» (PNG) y «Mostrar tabla» / «Ocultar tabla» para verificar los datos.

## Estructura

```
app.py                 Servidor Flask: lectura segura, filtro de datos personales, agregados
templates/index.html   Página (4 pasos)
static/css/styles.css  Estilo (blanco / azul)
static/js/app.js       Lógica del cliente y gráficos (sin librerías externas)
ejemplo_datos.xlsx     Archivo de prueba ficticio (2 hojas)
```

## Nombres e identificaciones: nunca se muestran

Las columnas sensibles se descartan **en el servidor**: ni sus datos ni su nombre llegan al
navegador; solo se informa cuántas se ocultaron.

Se ocultan por **nombre de columna** (cédula, CI, ID, código, matrícula, nombres, apellidos,
paciente, estudiante, médico, responsable, tutor, correo, teléfono, dirección, código postal,
usuario, fecha de nacimiento, observaciones…) y por **contenido**, aunque la columna se llame
distinto: cédulas válidas, RUC, correos, teléfonos, números largos, códigos tipo «EST-0012»,
nombres de personas (incluso «Dr. Juan Pérez»), texto libre y valores únicos por persona.
Además, cualquier categoría que parezca un nombre o un número de identificación se agrupa en
«Otros», y los grupos con menos de 3 registros también.

## Seguridad

- El archivo se procesa **en memoria** y nunca se guarda en disco.
- Al navegador solo llegan **agregados** (conteos, promedios, histogramas), nunca filas.
- Grupos con menos de 3 registros se juntan en «Otros» (evita identificar personas).
- Anti XSS: el frontend inserta todo con `textContent` (nunca `innerHTML`) + CSP estricta
  (`script-src 'self'`, sin scripts en línea ni dominios externos).
- Anti CSRF: token por sesión + verificación de `Origin` + cookie `HttpOnly; SameSite=Strict`.
- Inyección de fórmulas (`=`, `+`, `-`, `@`) y caracteres de control neutralizados.
- Archivos: solo `.xlsx`/`.csv`, máx. 5 MB, firma verificada, se rechazan macros,
  protección contra zip bombs y XML malicioso (`defusedxml`), límite de filas/columnas/hojas.
- Límite de 12 cargas por minuto por IP.
- Errores genéricos: nunca se muestran rutas ni trazas internas.
- Cabeceras: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`,
  `Permissions-Policy`, HSTS en producción.

## Publicarlo en internet

1. Usa **HTTPS** siempre (Render, Railway, PythonAnywhere o un VPS con Nginx).
2. Define variables de entorno:
   - `APP_ENV=production` (cookies seguras, HSTS)
   - `SECRET_KEY=<cadena larga aleatoria>`
   - `TRUST_PROXY=1` si va detrás de un proxy (Render, Nginx…)
   - `HOST=0.0.0.0` y `PORT=<puerto>`
3. Comando de inicio: `python app.py` (usa `waitress`, servidor de producción).

> Nota: la detección es automática y muy amplia; ante la duda, la columna se oculta.
