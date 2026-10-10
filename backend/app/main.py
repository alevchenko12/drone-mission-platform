from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.route import router as route_router
from app.api.routes.obstacles import router as obstacles_router
from app.api.routes.missions import router as missions_router

from app.api.routes.auth import router as auth_router

app = FastAPI(title="Drone Route Planner API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(route_router)
app.include_router(obstacles_router)
app.include_router(missions_router)
app.include_router(auth_router)

@app.get("/health")
def health_check():
    return {"status": "ok"}