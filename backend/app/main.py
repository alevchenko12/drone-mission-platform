"""
Main entry point for the drone route planning backend.

This module creates a FastAPI application and includes the
API routes defined in ``app.api.routes.route``.  Running this
module with ``uvicorn`` will start the backend server.

Example:

    uvicorn app.main:app --reload
"""
from fastapi import FastAPI
from app.api.routes.route import router as route_router

def create_app() -> FastAPI:
    """Construct and return the FastAPI application."""
    app = FastAPI(title="Drone Route Planner API", version="1.0.0")
    # Include the route planner endpoints (single‑ and multi‑route)
    app.include_router(route_router)
    return app

# Instantiate the FastAPI application
app = create_app()

@app.get("/health", tags=["Health"])
def health_check() -> dict[str, str]:
    """Simple health check endpoint to verify the service is running."""
    return {"status": "ok"}