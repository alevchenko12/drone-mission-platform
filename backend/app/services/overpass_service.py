import httpx
from typing import Any, Dict, List, Optional

OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def _build_overpass_query(
    min_lat: float,
    min_lon: float,
    max_lat: float,
    max_lon: float,
) -> str:
    return (
        f"[out:json][timeout:25];"
        f"("
        f'way["building"]({min_lat},{min_lon},{max_lat},{max_lon});'
        f'relation["building"]({min_lat},{min_lon},{max_lat},{max_lon});'
        f");"
        f"out geom;"
    )


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

    return {
        "id": f"osm-{element['type']}-{element['id']}",
        "source": "osm",
        "type": "building",
        "geometry": [{"lat": p["lat"], "lon": p["lon"]} for p in geometry],
        "height": _parse_height(element.get("tags", {})),
    }


def _relation_to_obstacle(element: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    members = element.get("members", [])

    for member in members:
        if member.get("role") == "outer" and "geometry" in member:
            geometry = member.get("geometry", [])
            if len(geometry) < 3:
                continue

            return {
                "id": f"osm-{element['type']}-{element['id']}",
                "source": "osm",
                "type": "building",
                "geometry": [{"lat": p["lat"], "lon": p["lon"]} for p in geometry],
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

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                OVERPASS_URL,
                data={"data": query},
                headers={
                    "User-Agent": "drone-route-planner/0.1",
                    "Accept": "application/json",
                },
            )

            response.raise_for_status()
            data = response.json()

    except httpx.TimeoutException as exc:
        raise RuntimeError("timeout") from exc

    except httpx.HTTPStatusError as exc:
        status_code = exc.response.status_code if exc.response else None

        if status_code == 429:
            raise RuntimeError("rate_limited") from exc

        if status_code == 504:
            raise RuntimeError("timeout") from exc

        if status_code == 406:
            raise RuntimeError("not_acceptable") from exc

        raise RuntimeError(f"http_{status_code}") from exc

    except httpx.RequestError as exc:
        raise RuntimeError("request_failed") from exc

    except ValueError as exc:
        raise RuntimeError("invalid_json") from exc

    elements = data.get("elements", [])
    obstacles: List[Dict[str, Any]] = []

    for element in elements:
        obstacle = None

        if element.get("type") == "way":
            obstacle = _way_to_obstacle(element)
        elif element.get("type") == "relation":
            obstacle = _relation_to_obstacle(element)

        if obstacle:
            obstacles.append(obstacle)

    return obstacles