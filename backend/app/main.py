from fastapi import FastAPI
from app.api.routes import health, route

app = FastAPI(title="Drone Route Planner API")

app.include_router(health.router)
app.include_router(route.router)