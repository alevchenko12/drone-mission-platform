import httpx
from typing import Any, Dict, List, Optional


OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def _build_overpass_query(
    min_lat: float,
    min_lon: float,
    max_lat: float,
    max_lon: float,
) -> str:
    return f"""
    [out:json][timeout:25];
    (
      way["building"]({min_lat},{min_lon},{max_lat},{max_lon});
      relation["building"]({min_lat},{min_lon},{max_lat},{max_lon});
    );
    out geom;
    """


def _parse_height(tags: Dict[str, Any]) -> float:
    if not tags:
        return 0.0

    raw_height = tags.get("height")
    if raw_height:
        try:
            cleaned = str(raw_height).lower().replace("m", "").strip()
            return float(cleaned)
        except ValueError:
            pass

    levels = tags.get("building:levels")
    if levels:
        try:
            return float(levels) * 3.0
        except ValueError:
            pass

    return 0.0


def _way_to_obstacle(element: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    geometry = element.get("geometry", [])
    if len(geometry) < 3:
        return None

    obstacle_geometry = [{"lat": p["lat"], "lon": p["lon"]} for p in geometry]

    return {
        "id": f"osm-{element['type']}-{element['id']}",
        "source": "osm",
        "type": "building",
        "geometry": obstacle_geometry,
        "height": _parse_height(element.get("tags", {})),
    }


def _relation_to_obstacle(element: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    members = element.get("members", [])

    for member in members:
        if member.get("role") == "outer" and "geometry" in member:
            geometry = member.get("geometry", [])
            if len(geometry) < 3:
                continue

            obstacle_geometry = [{"lat": p["lat"], "lon": p["lon"]} for p in geometry]

            return {
                "id": f"osm-{element['type']}-{element['id']}",
                "source": "osm",
                "type": "building",
                "geometry": obstacle_geometry,
                "height": _parse_height(element.get("tags", {})),
            }

    return None


async def fetch_building_obstacles(
    min_lat: float,
    min_lon: float,
    max_lat: float,
    max_lon: float,
) -> List[Dict[str, Any]]:
    query = _build_overpass_query(min_lat, min_lon, max_lat, max_lon)

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            OVERPASS_URL,
            content=query,
            headers={"Content-Type": "text/plain"},
        )
        response.raise_for_status()
        data = response.json()

    elements = data.get("elements", [])
    obstacles: List[Dict[str, Any]] = []

    for element in elements:
        element_type = element.get("type")

        obstacle = None
        if element_type == "way":
            obstacle = _way_to_obstacle(element)
        elif element_type == "relation":
            obstacle = _relation_to_obstacle(element)

        if obstacle:
            obstacles.append(obstacle)

    return obstacles