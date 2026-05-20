"""
Top-level package for the drone route planner backend.

This file exposes the FastAPI application via the ``app`` attribute.
"""
from .main import app as app

__all__ = ["app"]