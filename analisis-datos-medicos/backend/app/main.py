from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.controllers.excel_controller import router as excel_router

app = FastAPI(
    title="Motor de Análisis de Datos Médicos",
    description="API FastAPI para detección universal, limpieza y análisis dinámico de archivos Excel.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "*",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(excel_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
