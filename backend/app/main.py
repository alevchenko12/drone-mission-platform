from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.route import router as route_router
from app.api.routes.obstacles import router as obstacles_router
from app.api.routes.missions import router as missions_router

from app.api.routes.auth import router as auth_router

from app.auth_dependencies import ALLOWED_ORIGINS

app = FastAPI(title="Drone Route Planner API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(ALLOWED_ORIGINS),
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)

app.include_router(route_router)
app.include_router(obstacles_router)
app.include_router(missions_router)
app.include_router(auth_router)

@app.get("/health")
def health_check():
    return {"status": "ok"}