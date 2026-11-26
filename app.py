# -*- coding: utf-8 -*-
"""
Dashboard de Vinculación - servidor seguro.

Flujo:
  1. El navegador sube un Excel (.xlsx) o CSV.
  2. Python lo lee SOLO en memoria (nunca se guarda en disco).
  3. Se detectan y descartan los campos sensibles (cédula, nombres, correos,
     teléfonos, direcciones, identificadores, texto libre...).
  4. Se devuelven al navegador ÚNICAMENTE datos agregados (conteos, promedios,
     histogramas). Nunca filas individuales.

Ejecutar:
    pip install -r requirements.txt
    python app.py            -> http://127.0.0.1:5000
"""
from __future__ import annotations

import hmac
import io
import logging
import math
import mimetypes
import os
import random
import re
import secrets
import threading
import time
import unicodedata
import zipfile
from collections import defaultdict, deque
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from flask import Flask, abort, jsonify, render_template, request, session

# Si defusedxml está instalado, openpyxl lo usa automáticamente
# (protege contra XXE y "billion laughs" dentro del .xlsx).
try:
    import defusedxml  # noqa: F401
except ImportError:  # pragma: no cover
    logging.warning("defusedxml no está instalado: instálalo para máxima seguridad.")

# En algunos Windows el registro marca .css/.js como "text/plain" y, con la
# cabecera nosniff, el navegador los bloquea (la página sale sin estilos).
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("image/svg+xml", ".svg")

# --------------------------------------------------------------------------- #
# Configuración
# --------------------------------------------------------------------------- #
MAX_UPLOAD_MB = 5
MAX_UNZIPPED_MB = 60          # protección contra "zip bombs"
MAX_ZIP_ENTRIES = 500
MAX_ROWS = 50_000
MAX_COLS = 150
MAX_SHEETS = 10
MIN_GROUP = 3                 # grupos con menos de 3 personas se agrupan en "Otros"
MAX_CATEGORIES = 8
RATE_LIMIT = (12, 60)         # 12 cargas por minuto por IP
IS_PROD = os.environ.get("APP_ENV", "").lower() in ("prod", "production")

app = Flask(__name__)
app.config.update(
    SECRET_KEY=os.environ.get("SECRET_KEY") or secrets.token_hex(32),
    MAX_CONTENT_LENGTH=MAX_UPLOAD_MB * 1024 * 1024,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Strict",
    SESSION_COOKIE_SECURE=IS_PROD,
    SESSION_COOKIE_NAME="__dash" if not IS_PROD else "__Host-dash",
    PERMANENT_SESSION_LIFETIME=timedelta(hours=2),
    JSON_SORT_KEYS=False,
)

if os.environ.get("TRUST_PROXY") == "1":  # si va detrás de Nginx / Render / etc.
    from werkzeug.middleware.proxy_fix import ProxyFix
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)

log = logging.getLogger("dashboard")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


# --------------------------------------------------------------------------- #
# Seguridad HTTP
# --------------------------------------------------------------------------- #
CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; "
    "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; "
    "form-action 'self'; frame-ancestors 'none'"
) + ("; upgrade-insecure-requests" if IS_PROD else "")


@app.after_request
def security_headers(resp):
    resp.headers["Content-Security-Policy"] = CSP
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    resp.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    resp.headers["Permissions-Policy"] = (
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
    )
    if IS_PROD:
        resp.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    if request.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    resp.headers.pop("Server", None)
    return resp


def csrf_token() -> str:
    if "csrf" not in session:
        session["csrf"] = secrets.token_urlsafe(32)
        session.permanent = True
    return session["csrf"]


def check_request_security():
    """CSRF + origen + rate limit para todas las llamadas que modifican estado."""
    sent = request.headers.get("X-CSRF-Token", "")
    real = session.get("csrf", "")
    if not real or not hmac.compare_digest(sent, real):
        abort(403)
    origin = request.headers.get("Origin")
    if origin and origin.rstrip("/") != request.host_url.rstrip("/"):
        abort(403)
    if not rate_ok(request.remote_addr or "?"):
        abort(429)


_hits: dict[str, deque] = defaultdict(deque)
_hits_lock = threading.Lock()


def rate_ok(ip: str) -> bool:
    limit, window = RATE_LIMIT
    now = time.monotonic()
    with _hits_lock:
        q = _hits[ip]
        while q and now - q[0] > window:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(now)
        if len(_hits) > 10_000:  # evita crecer sin límite
            _hits.clear()
        return True


class UserError(Exception):
    """Error con mensaje seguro para mostrar al usuario."""


@app.errorhandler(UserError)
def _user_error(e):
    return jsonify(ok=False, error=str(e)), 400


@app.errorhandler(403)
def _e403(_):
    return jsonify(ok=False, error="Solicitud no autorizada. Recarga la página."), 403


@app.errorhandler(413)
def _e413(_):
    return jsonify(ok=False, error=f"El archivo supera el límite de {MAX_UPLOAD_MB} MB."), 413


@app.errorhandler(429)
def _e429(_):
    return jsonify(ok=False, error="Demasiadas solicitudes. Espera un minuto."), 429


@app.errorhandler(404)
def _e404(_):
    return jsonify(ok=False, error="No encontrado."), 404


@app.errorhandler(405)
def _e405(_):
    return jsonify(ok=False, error="Método no permitido."), 405


@app.errorhandler(Exception)
def _e500(e):
    # Nunca se envían detalles internos (rutas, trazas) al navegador.
    log.error("Error interno: %s", type(e).__name__)
    return jsonify(ok=False, error="No se pudo procesar la solicitud."), 500


# --------------------------------------------------------------------------- #
# Limpieza de texto (anti-inyección)
# --------------------------------------------------------------------------- #
_CTRL = re.compile(r"[\x00-\x1f\x7f-\x9f​-‏‪-‮⁦-⁩]")


def clean_text(value, max_len: int = 60) -> str:
    """Texto seguro para mostrar: sin caracteres de control, sin fórmulas, acotado."""
    s = _CTRL.sub("", str(value)).strip()
    s = re.sub(r"\s+", " ", s)
    s = s.replace("<", "‹").replace(">", "›")      # defensa extra además de textContent
    if s[:1] in ("=", "+", "-", "@", "\t", "\r"):  # inyección de fórmulas (CSV/Excel)
        s = "'" + s
    if len(s) > max_len:
        s = s[: max_len - 1] + "…"
    return s or "(vacío)"


# Palabras cortas que NO son siglas (se escriben en minúscula)
_SMALL = {"de", "del", "la", "las", "el", "los", "lo", "y", "e", "o", "u", "en", "por", "para",
          "con", "sin", "a", "al", "su", "sus", "no", "si", "sí", "un", "una", "que", "se", "le",
          "mi", "tu", "ya", "ni", "es", "fue", "muy", "mas", "más", "hay", "dia", "día", "año",
          "mes", "uno", "dos", "ver", "ojo", "pie", "sur", "eje", "red", "gen", "tos", "sed"}
# Unidades que van en minúscula
_UNITS = {"kg", "g", "mg", "mcg", "cm", "mm", "m", "km", "ml", "l", "dl", "h", "hr", "hrs", "min",
          "seg", "lb", "lbs", "mmhg", "bpm", "lpm", "kcal", "cc", "ui"}
_LETTERS = re.compile(r"[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]")


def pretty(value, max_len: int = 60, is_name: bool = False) -> str:
    """Recorta espacios y convierte TEXTO EN MAYÚSCULAS a 'Texto en mayúsculas',
    respetando siglas (IMC, T.A, HTA) y unidades (kg, cm)."""
    s = str(value)
    if is_name:
        s = s.replace("_", " ")
    s = clean_text(s, max_len)
    letters = [c for c in s if c.isalpha()]
    if s.lower() in _SMALL:                            # "NO" -> "No", "SI" -> "Si"
        s = s.lower()
    elif len(letters) > 3 and all(c.isupper() for c in letters):
        out = []
        for tok in s.split(" "):
            core = _LETTERS.sub("", tok)
            low = core.lower()
            if low in _UNITS:
                tok = tok.lower().replace("mmhg", "mmHg")
            elif "." in tok.strip(".,;:()") or (core and len(core) <= 3 and low not in _SMALL):
                pass                                   # sigla: se deja igual
            else:
                tok = tok.lower()
            out.append(tok)
        s = " ".join(out)
    # Primera letra en mayúscula
    for i, ch in enumerate(s):
        if ch.isalpha():
            if ch.islower():
                s = s[:i] + ch.upper() + s[i + 1:]
            break
    return s


def norm(s) -> str:
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


# --------------------------------------------------------------------------- #
# Detección de datos sensibles
#   Regla de oro: ante la duda, la columna se OCULTA. Sus datos y su nombre
#   nunca salen del servidor; solo se informa cuántas columnas se ocultaron.
# --------------------------------------------------------------------------- #
SENSITIVE_WORDS = {
    # identificación
    "cedula", "ci", "dni", "pasaporte", "ruc", "identificacion", "identidad", "documento",
    "id", "uuid", "matricula", "codigo", "cod", "placa", "expediente", "historia", "hc",
    "nui", "nuip", "curp", "rut", "nss", "ssn", "carnet", "credencial",
    # nombres / personas
    "nombre", "nombres", "apellido", "apellidos", "name", "names", "surname", "fullname",
    "representante", "tutor", "padre", "madre", "conyuge", "firma", "paciente", "alumno",
    "estudiante", "persona", "medico", "doctor", "dr", "dra", "docente", "profesor",
    "responsable", "encargado", "titular", "propietario", "autor", "evaluador",
    "psicologo", "enfermero", "enfermera", "usuario", "user", "username", "login",
    "contacto", "familiar", "acudiente",
    # contacto / ubicación
    "correo", "email", "mail", "gmail", "telefono", "celular", "movil", "whatsapp", "phone",
    "tlf", "telf", "fono", "direccion", "domicilio", "address", "calle", "barrio", "postal",
    "coordenadas", "latitud", "longitud", "ip", "ubicacion",
    # credenciales / financiero / otros
    "password", "contrasena", "clave", "token", "tarjeta", "cuenta", "iban", "foto",
    "imagen", "observacion", "observaciones", "comentario", "comentarios", "nota_libre",
}
SENSITIVE_PHRASES = (
    "fecha nacimiento", "fecha de nacimiento", "nacimiento", "numero de documento",
    "nro documento", "num documento", "nombre completo", "lugar de nacimiento",
)

# Nombres de pila frecuentes (para reconocer columnas con nombres de personas
# aunque la columna no se llame "nombre", p. ej. "Responsable": "Dr. Juan Pérez").
FIRST_NAMES = set("""
ana maria jose juan luis carlos jorge pedro pablo miguel angel antonio manuel francisco javier
david daniel diego andres alejandro fernando ricardo roberto eduardo sergio raul oscar mario
marco marcos victor hugo cesar jaime julio rafael ramon alberto alfredo arturo enrique ernesto
felipe gabriel gonzalo gustavo hector ivan joaquin jesus kevin leonardo lucas martin mateo
matias nicolas omar patricio renato rodrigo samuel santiago sebastian simon tomas walter
wilson xavier bryan brian anthony steven christian cristian edison byron fausto galo freddy
josue emilio esteban adrian alan alex alexander bruno camilo dario elias emanuel fabian
franklin geovanny giovanny henry isaac ismael jean jefferson jhon john jonathan jordan
kleber leonel marlon mauricio michael milton nelson orlando paul rene richard ronald
rolando segundo stalin teodoro ulises vicente washington wellington william yandri
sofia valentina camila valeria isabella daniela gabriela andrea paola carolina mariana fernanda
natalia lucia paula sara laura carla monica patricia veronica diana adriana alejandra
alexandra angela beatriz carmen catalina cecilia claudia cristina dayana diana dolores elena
elizabeth emilia erika estefania esther evelyn fatima gloria grace ines irene isabel
jacqueline janeth jenny jessica johanna josefina juana julia karina karla katherine
kimberly leticia lorena lourdes luisa luz magdalena margarita maritza marlene martha mayra
melany mercedes micaela michelle miriam nancy nathaly nelly noemi norma olga pamela
priscila rocio rosa rosario ruth sandra silvia sonia susana tamara tatiana teresa vanessa
victoria viviana ximena yadira yolanda zoila nayeli ashley britany dayanna emely genesis
""".split())

RE_EMAIL = re.compile(r"[^@\s]+@[^@\s]+\.[a-z]{2,}", re.I)
RE_PHONE = re.compile(r"^(\+?593|0)?9\d{8}$|^0[2-7]\d{7}$")
RE_WORDS = re.compile(r"^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'´.]{2,}(\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'´.]{2,}){1,4}$")
RE_DIGITS = re.compile(r"[\s\-.]")
RE_LONGNUM = re.compile(r"\d{6,}")
TITLES = {"dr", "dra", "lic", "ing", "msc", "mg", "phd", "sr", "sra", "srta", "psic", "enf", "abg"}


def cedula_valida(d: str) -> bool:
    """Algoritmo módulo 10 de la cédula ecuatoriana."""
    if len(d) != 10 or not d.isdigit() or not (1 <= int(d[:2]) <= 24 or d[:2] == "30"):
        return False
    total = 0
    for i, ch in enumerate(d[:9]):
        n = int(ch) * (2 if i % 2 == 0 else 1)
        total += n - 9 if n > 9 else n
    return (10 - total % 10) % 10 == int(d[9])


def sensitive_by_name(col: str) -> bool:
    n = norm(col)
    if any(p in n for p in SENSITIVE_PHRASES):
        return True
    toks = set(n.split()) | set(norm(re.sub(r"([a-z])([A-Z])", r"\1 \2", str(col))).split())
    return bool(toks & SENSITIVE_WORDS)


def looks_like_person(value: str) -> bool:
    toks = [t for t in norm(value).split() if t not in TITLES]
    if not toks:
        return False
    if len(toks) == 1:
        return toks[0] in FIRST_NAMES
    return toks[0] in FIRST_NAMES or (len(toks) >= 2 and toks[1] in FIRST_NAMES and len(toks) <= 4)


def looks_like_identifier(value: str) -> bool:
    v = str(value).strip()
    d = RE_DIGITS.sub("", v[:-2] if v.endswith(".0") else v)
    return bool(RE_EMAIL.search(v)) or bool(RE_LONGNUM.search(d)) or bool(RE_PHONE.match(d))


def sensitive_by_content(s: pd.Series) -> bool:
    vals = s.dropna()
    if vals.empty:
        return False
    # Fechas (de ingreso, aplicación...) no identifican por sí solas; la fecha de
    # nacimiento ya se oculta por el nombre de la columna.
    if pd.api.types.is_datetime64_any_dtype(s) or \
            vals.head(50).map(lambda x: isinstance(x, (datetime, pd.Timestamp))).mean() >= 0.9 or \
            vals.astype(str).head(200).str.match(r"^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}([ T]\d{1,2}:\d{2}(:\d{2})?)?$").mean() >= 0.9:
        return False
    sample = vals.sample(min(len(vals), 400), random_state=0) if len(vals) > 400 else vals
    txt = sample.astype(str).str.strip()
    n = len(txt)
    uniq_ratio = vals.astype(str).nunique() / max(len(vals), 1)
    digits = txt.map(lambda x: RE_DIGITS.sub("", x[:-2] if x.endswith(".0") else x))

    if digits.map(lambda d: (len(d) == 10 and cedula_valida(d)) or (len(d) == 9 and cedula_valida("0" + d))).mean() >= 0.3:
        return True                                   # cédulas
    if digits.map(lambda d: len(d) == 13 and d.isdigit()).mean() >= 0.3:
        return True                                   # RUC
    if txt.map(lambda x: bool(RE_EMAIL.search(x))).mean() >= 0.2:
        return True                                   # correos
    if digits.map(lambda d: bool(RE_PHONE.match(d)) or bool(RE_PHONE.match("0" + d))).mean() >= 0.3:
        return True                                   # teléfonos
    if digits.map(lambda d: d.isdigit() and len(d) >= 7).mean() >= 0.3:
        return True                                   # números largos (códigos, cuentas)

    if not pd.api.types.is_numeric_dtype(s):
        if txt.map(looks_like_person).mean() >= 0.3:
            return True                               # nombres de personas
        if txt.map(lambda x: bool(RE_WORDS.match(x))).mean() >= 0.6 and uniq_ratio >= 0.5:
            return True                               # texto tipo "Nombre Apellido" muy variado
        if txt.str.len().mean() > 40:
            return True                               # texto libre
        if uniq_ratio > 0.6 and vals.astype(str).nunique() > 12:
            return True                               # casi un valor distinto por persona
        if txt.str.match(r"^[A-Za-z]{0,4}[-_ ]?\d{3,}$").mean() >= 0.5:
            return True                               # códigos tipo "EST-00123"
    else:
        num = pd.to_numeric(vals, errors="coerce").dropna()
        if len(num) > 10 and uniq_ratio >= 0.95 and (num % 1 == 0).all():
            srt = num.sort_values()
            if (srt.diff().dropna() == 1).mean() >= 0.8 or srt.abs().median() >= 1000:
                return True                           # entero distinto por fila = ID
    return False

# --------------------------------------------------------------------------- #
# Lectura segura de archivos
# --------------------------------------------------------------------------- #
def read_upload(storage) -> dict[str, pd.DataFrame]:
    filename = (storage.filename or "").lower()
    ext = filename.rsplit(".", 1)[-1] if "." in filename else ""
    if ext not in ("xlsx", "csv"):
        raise UserError("Formato no permitido. Usa un archivo .xlsx o .csv.")
    raw = storage.read(MAX_UPLOAD_MB * 1024 * 1024 + 1)
    if not raw:
        raise UserError("El archivo está vacío.")
    if len(raw) > MAX_UPLOAD_MB * 1024 * 1024:
        raise UserError(f"El archivo supera el límite de {MAX_UPLOAD_MB} MB.")

    if ext == "xlsx":
        if raw[:4] != b"PK\x03\x04":
            raise UserError("El archivo no es un Excel (.xlsx) válido.")
        try:
            with zipfile.ZipFile(io.BytesIO(raw)) as z:
                infos = z.infolist()
                if len(infos) > MAX_ZIP_ENTRIES:
                    raise UserError("El archivo Excel tiene una estructura no permitida.")
                if sum(i.file_size for i in infos) > MAX_UNZIPPED_MB * 1024 * 1024:
                    raise UserError("El archivo Excel es demasiado grande al descomprimirse.")
                names = {i.filename for i in infos}
                if "xl/workbook.xml" not in names:
                    raise UserError("El archivo no es un Excel (.xlsx) válido.")
                if any(n.endswith("vbaProject.bin") for n in names):
                    raise UserError("No se aceptan archivos con macros.")
        except zipfile.BadZipFile:
            raise UserError("El archivo Excel está dañado.")
        try:
            sheets = pd.read_excel(io.BytesIO(raw), sheet_name=None, engine="openpyxl",
                                   nrows=MAX_ROWS + 1)
        except UserError:
            raise
        except Exception:
            raise UserError("No se pudo leer el Excel. Verifica que no esté protegido o dañado.")
    else:
        if b"\x00" in raw[:4096]:
            raise UserError("El CSV no es un archivo de texto válido.")
        for enc in ("utf-8-sig", "latin-1"):
            try:
                text = raw.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        try:
            df = pd.read_csv(io.StringIO(text), sep=None, engine="python", nrows=MAX_ROWS + 1,
                             dtype=str, keep_default_na=True)
        except Exception:
            raise UserError("No se pudo leer el CSV.")
        sheets = {"Datos": df}
    del raw

    if not sheets:
        raise UserError("El archivo no contiene hojas con datos.")
    if len(sheets) > MAX_SHEETS:
        sheets = dict(list(sheets.items())[:MAX_SHEETS])
    return sheets


# --------------------------------------------------------------------------- #
# Análisis (solo agregados)
# --------------------------------------------------------------------------- #
MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]


def _num(x, nd=2):
    if x is None:
        return None
    x = float(x)
    if math.isnan(x) or math.isinf(x):
        return None
    return round(x, nd)


def _safe_label(v) -> str | None:
    """Etiqueta de categoría; None si parece un dato personal (se manda a 'Otros')."""
    s = str(v).strip()
    if not s or looks_like_identifier(s) or looks_like_person(s):
        return None
    return pretty(s, 40)


def view_categorical(s: pd.Series, ordinal: bool) -> dict | None:
    vals = s.dropna()
    if ordinal:
        vals = pd.to_numeric(vals, errors="coerce").dropna()
        vals = vals.map(lambda v: int(v) if float(v).is_integer() else v)
        counts = vals.value_counts().sort_index()
    else:
        vals = vals.astype(str).map(lambda x: re.sub(r"\s+", " ", x).strip())
        vals = vals[vals != ""]
        # "FEMENINO", "femenino " y "Femenino" cuentan como la misma categoría
        vals = vals.map(lambda x: x.lower()).map(
            dict(zip(vals.map(lambda x: x.lower()), vals.map(lambda x: pretty(x, 40)))))
        counts = vals.value_counts()
    if counts.empty:
        return None
    items, other = [], 0
    for k, c in counts.items():
        label = clean_text(k, 40) if ordinal else _safe_label(k)
        if label is None or c < MIN_GROUP:
            other += int(c)
        else:
            items.append({"label": label, "count": int(c)})
    if not ordinal and len(items) > MAX_CATEGORIES - 1:
        other += sum(i["count"] for i in items[MAX_CATEGORIES - 1:])
        items = items[: MAX_CATEGORIES - 1]
    if other:
        items.append({"label": "Otros", "count": other, "other": True})
    real = [i for i in items if not i.get("other")]
    if len(real) < 1 or (len(items) < 2 and not ordinal):
        return None
    return {"kind": "cat", "ordinal": ordinal, "total": int(sum(i["count"] for i in items)),
            "items": items}


def _nice_step(raw: float, integer: bool) -> float:
    if raw <= 0:
        return 1
    mag = 10 ** math.floor(math.log10(raw))
    for m in (1, 2, 2.5, 5, 10):
        step = m * mag
        if step >= raw and (not integer or float(step).is_integer()):
            return step
    return 10 * mag


def view_numeric(name: str, s: pd.Series) -> dict | None:
    v = pd.to_numeric(s, errors="coerce").dropna()
    v = v[np.isfinite(v)]
    if len(v) < MIN_GROUP:
        return None
    integer = bool((v % 1 == 0).all())
    lo, hi = float(v.min()), float(v.max())
    items = []
    is_age = bool(re.search(r"\b(edad|age|anos)\b", norm(name)))
    if lo == hi:
        items.append({"label": clean_text(_num(lo)), "count": int(len(v))})
    elif is_age and hi - lo >= 25 and lo >= 0:
        # Grupos de edad estándar (0–11, 12–17, 18–29, 30–44, 45–64, 65+)
        groups = [(0, 12, "0–11"), (12, 18, "12–17"), (18, 30, "18–29"), (30, 45, "30–44"),
                  (45, 65, "45–64"), (65, 10_000, "65+")]
        for a, b, lab in groups:
            c = int(((v >= a) & (v < b)).sum())
            if c or (items and a <= hi):
                items.append({"label": lab, "count": c})
        while items and items[-1]["count"] == 0:
            items.pop()
    else:
        step = _nice_step((hi - lo) / 7, integer)
        start = math.floor(lo / step) * step
        edges = [start]
        while edges[-1] <= hi:
            edges.append(edges[-1] + step)
        cats = pd.cut(v, bins=edges, right=False, include_lowest=True)
        counts = cats.value_counts(sort=False)
        for interval, c in counts.items():
            a, b = interval.left, interval.right
            a, b = max(a, lo), min(b, hi + (1 if integer else 0))  # no mostrar valores fuera de los datos
            if integer:
                lab = f"{int(a)}" if int(b) - 1 <= int(a) else f"{int(a)}–{int(b) - 1}"
            else:
                lab = f"{_num(a):g}–{_num(b):g}".replace(".", ",")   # decimales con coma
            items.append({"label": lab, "count": int(c)})
        # quita rangos vacíos de los extremos
        while items and items[0]["count"] == 0:
            items.pop(0)
        while items and items[-1]["count"] == 0:
            items.pop()
    n = norm(name)
    unit = "años" if re.search(r"\b(edad|age|anos)\b", n) else ""
    return {
        "kind": "num", "total": int(len(v)), "items": items, "unit": unit,
        "stats": {"mean": _num(v.mean()), "median": _num(v.median()), "min": _num(lo),
                  "max": _num(hi), "std": _num(v.std(ddof=0))},
    }


def view_dates(s: pd.Series) -> dict | None:
    dt = pd.to_datetime(s, errors="coerce", dayfirst=True).dropna()
    if len(dt) < MIN_GROUP:
        return None
    span = (dt.max().year - dt.min().year) * 12 + dt.max().month - dt.min().month
    if span > 36:
        counts = dt.dt.year.value_counts().sort_index()
        items = [{"label": str(int(y)), "count": int(c)} for y, c in counts.items()]
        gran = "anual"
    else:
        per = dt.dt.to_period("M")
        full = pd.period_range(per.min(), per.max(), freq="M")
        counts = per.value_counts().reindex(full, fill_value=0)
        items = [{"label": f"{MESES[p.month - 1]} {str(p.year)[2:]}", "count": int(c)}
                 for p, c in counts.items()]
        gran = "mensual"
    return {"kind": "date", "total": int(len(dt)), "items": items, "granularity": gran}


def _detect_type(s: pd.Series) -> tuple[str, pd.Series]:
    nonnull = s.dropna()
    if pd.api.types.is_datetime64_any_dtype(s):
        return "fecha", s
    if pd.api.types.is_bool_dtype(s):
        return "categórica", s.map({True: "Sí", False: "No"})
    num = pd.to_numeric(nonnull, errors="coerce")
    if len(nonnull) and num.notna().mean() >= 0.9:
        num = num.dropna()
        if (num % 1 == 0).all() and num.nunique() <= 10:
            return "ordinal", pd.to_numeric(s, errors="coerce")
        return "numérica", pd.to_numeric(s, errors="coerce")
    if any(isinstance(x, (datetime, pd.Timestamp)) for x in nonnull.head(20)):
        return "fecha", s
    txt = nonnull.astype(str).head(200)
    if len(txt) and txt.str.match(r"^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}").mean() >= 0.9:
        return "fecha", s
    return "categórica", s


def analyze(sheets: dict[str, pd.DataFrame]) -> dict:
    out_sheets, hidden, tot_rows, available = [], 0, 0, 0
    for si, (sheet_name, df) in enumerate(sheets.items()):
        df = df.dropna(how="all").dropna(axis=1, how="all")
        if df.empty:
            continue
        truncated = len(df) > MAX_ROWS
        df = df.iloc[:MAX_ROWS, :MAX_COLS]
        columns = []
        for ci in range(df.shape[1]):
            raw_name = str(df.columns[ci])
            name = f"Columna {ci + 1}" if raw_name.startswith("Unnamed") or not raw_name.strip() else raw_name
            s = df.iloc[:, ci]
            if sensitive_by_name(name) or sensitive_by_content(s):
                hidden += 1          # ni el nombre ni los datos salen del servidor
                continue
            ctype, s2 = _detect_type(s)
            if ctype == "fecha":
                view = view_dates(s2)
            elif ctype == "numérica":
                view = view_numeric(name, s2)
            else:
                view = view_categorical(s2, ordinal=(ctype == "ordinal"))
            if not view:
                continue
            columns.append({"key": f"{si}:{ci}", "name": pretty(name, is_name=True),
                            "type": "categórica" if ctype == "ordinal" else ctype, "view": view})
        rows = int(len(df))
        del df
        if not columns:
            continue
        tot_rows += rows
        available += len(columns)
        out_sheets.append({"name": pretty(sheet_name, 40, is_name=True), "rows": rows,
                           "truncated": truncated, "columns": columns})

    if not out_sheets:
        raise UserError("No se encontraron columnas analizables (o todas contenían datos personales).")
    return {
        "ok": True,
        "totals": {"rows": max(s["rows"] for s in out_sheets), "sheets": len(out_sheets),
                   "available": available, "hidden": hidden},
        "sheets": out_sheets,
        "policy": {"min_group": MIN_GROUP},
    }


# --------------------------------------------------------------------------- #
# Datos de demostración (100 % ficticios)
# --------------------------------------------------------------------------- #
def _fake_cedula(rng: random.Random) -> str:
    while True:
        d = f"{rng.randint(1, 24):02d}" + "".join(str(rng.randint(0, 9)) for _ in range(7))
        total = 0
        for i, ch in enumerate(d):
            n = int(ch) * (2 if i % 2 == 0 else 1)
            total += n - 9 if n > 9 else n
        d += str((10 - total % 10) % 10)
        if cedula_valida(d):
            return d


def demo_sheets(n: int = 248, seed: int = 7) -> dict[str, pd.DataFrame]:
    rng = random.Random(seed)
    nombres = ["Ana", "Luis", "María", "Carlos", "Sofía", "Jorge", "Valeria", "Andrés", "Camila",
               "Diego", "Paula", "Mateo", "Daniela", "Kevin", "Gabriela", "Josué", "Emilia"]
    apellidos = ["Pérez", "Torres", "Mendoza", "Vera", "Castro", "Zambrano", "Andrade",
                 "Morales", "Cedeño", "Rivas", "Loor", "Bravo", "Macías", "Ortiz"]
    carreras = ["Software", "Enfermería", "Psicología", "Administración", "Derecho"]
    tutores = ["Dr. Ricardo Vera", "Lic. Mónica Andrade", "Dra. Paola Cedeño", "Psic. Luis Bravo"]
    base = datetime(2026, 3, 2)
    enc, seg = [], []
    for i in range(n):
        score = max(0, min(21, int(rng.gauss(8, 4.6))))
        nivel = ("Mínima" if score <= 4 else "Leve" if score <= 9
                 else "Moderada" if score <= 14 else "Severa")
        ced = _fake_cedula(rng)
        enc.append({
            "ID": i + 1,
            "Cédula": ced,
            "Nombres completos": f"{rng.choice(nombres)} {rng.choice(apellidos)} {rng.choice(apellidos)}",
            "Correo": f"est{rng.randint(1000, 9999)}@demo.edu.ec",
            "Teléfono": f"09{rng.randint(10000000, 99999999)}",
            "Edad": max(17, min(35, int(rng.gauss(21, 2.6)))),
            "Sexo": rng.choices(["Femenino", "Masculino", "Otro"], [52, 45, 3])[0],
            "Carrera": rng.choice(carreras),
            "Semestre": rng.randint(1, 9),
            "Puntaje GAD-7": score,
            "Nivel de ansiedad": nivel,
            "Horas de sueño": round(max(3.5, min(10, rng.gauss(6.4, 1.2))), 1),
            "Fecha de aplicación": base + timedelta(days=int(rng.triangular(0, 240, 150))),
        })
        seg.append({
            "Cédula estudiante": ced,
            "Tutor asignado": rng.choice(tutores),
            "Asistió a seguimiento": rng.choices(["Sí", "No"], [68, 32])[0],
            "Sesiones": rng.choices([0, 1, 2, 3, 4], [20, 30, 25, 15, 10])[0],
            "Estado": rng.choices(["En seguimiento", "Alta", "Derivado"], [55, 35, 10])[0],
        })
    return {"Encuesta": pd.DataFrame(enc), "Seguimiento": pd.DataFrame(seg)}


# --------------------------------------------------------------------------- #
# Rutas
# --------------------------------------------------------------------------- #
def _static_version() -> str:
    """Huella de los archivos estáticos: si cambian, el navegador descarga la versión nueva."""
    import hashlib
    h = hashlib.sha256()
    for rel in ("css/styles.css", "js/app.js"):
        try:
            with open(os.path.join(app.static_folder, rel), "rb") as fh:
                h.update(fh.read())
        except OSError:
            pass
    return h.hexdigest()[:10]


@app.get("/")
def index():
    return render_template("index.html", csrf=csrf_token(), max_mb=MAX_UPLOAD_MB,
                           v=_static_version())


@app.post("/api/upload")
def api_upload():
    check_request_security()
    f = request.files.get("archivo")
    if f is None:
        raise UserError("No se recibió ningún archivo.")
    sheets = read_upload(f)
    result = analyze(sheets)
    del sheets
    result["source"] = "archivo"
    log.info("Archivo procesado: %s filas, %s columnas ocultas",
             result["totals"]["rows"], result["totals"]["hidden"])
    return jsonify(result)


@app.post("/api/demo")
def api_demo():
    check_request_security()
    result = analyze(demo_sheets())
    result["source"] = "demo"
    return jsonify(result)


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "5000"))
    try:
        from waitress import serve  # servidor de producción (funciona en Windows)
        print(f"Dashboard en http://{host}:{port}")
        serve(app, host=host, port=port, threads=4)
    except ImportError:
        app.run(host=host, port=port, debug=False)
