# drone-route-planner
Bachelors Project 

## Overview
Web application for drone route planning and simulation.

## Goal
Plan and simulate drone routes on a 2D map using real map data and obstacle avoidance.

## Tech Stack
- Frontend: React, Leaflet
- Backend: FastAPI, Python
- Planner: A* path planning
- Map Data: OpenStreetMap
- Obstacles: Overpass API

## Project Structure
- frontend/
- backend/
- planner/
- docs/

# Week 1

## Goal
Build the first working horizontal version of the system.

## Completed
- project structure set up
- backend initialized
- initial API contract defined
- frontend initialized
- Leaflet map integrated
- start and goal selection implemented
- frontend connected to backend
- mock route displayed on map

## Verification
- frontend starts correctly
- backend starts correctly
- route request works
- route appears on map
- reset works
- invalid flow handled without crash

## Current limitations
- route is mock only
- no obstacles yet
- no Overpass integration
- no A* planning yet
- no simulation yet
- no mission commands yet

## Next focus
Week 2: obstacle data and more realistic route behavior