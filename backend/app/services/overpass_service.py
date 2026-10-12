import hashlib
import logging
import os
import time
from typing import Any, Dict, List, Optional

import httpx


logger = logging.getLogger(__name__)

OVERPASS_URL = os.getenv(
    "OVERPASS_URL",
    "https://overpass-api.de/api/interpreter",
)

UNKNOWN_HEIGHT_MIN = 6.0
UNKNOWN_HEIGHT_MAX = 30.0

# Network waiting time is separate from Overpass query execution time.
OVERPASS_TIMEOUT = httpx.Timeout(
    connect=10.0,
    read=45.0,
    write=10.0,
    pool=5.0,
)


def _stable_random_height(element_id: Any) -> float:
    seed = str(element_id).encode("utf-8")
    digest = hashlib.sha256(seed).hexdigest()
    value = int(digest[:8], 16)

    normalized = value / 0xFFFFFFFF
    height = UNKNOWN_HEIGHT_MIN + normalized * (
        UNKNOWN_HEIGHT_MAX - UNKNOWN_HEIGHT_MIN
    )

    return round(height, 1)


def _build_overpass_query(
    min_lat: float,
    min_lon: float,
    max_lat: float,
    max_lon: float,
) -> str:
    return (
        "[out:json][timeout:15];"
        "("
        f'way["building"]({min_lat},{min_lon},{max_lat},{max_lon});'
        f'relation["building"]({min_lat},{min_lon},{max_lat},{max_lon});'
        ");"
        "out geom;"
    )


def _parse_height(tags: Dict[str, Any], fallback_seed: Any) -> float:
    if not tags:
        return _stable_random_height(fallback_seed)

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

    return _stable_random_height(fallback_seed)


def _way_to_obstacle(
    element: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    geometry = element.get("geometry", [])

    if len(geometry) < 3:
        return None

    return {
        "id": f"osm-{element['type']}-{element['id']}",
        "source": "osm",
        "type": "building",
        "geometry": [
            {"lat": point["lat"], "lon": point["lon"]}
            for point in geometry
        ],
        "height": _parse_height(
            element.get("tags", {}),
            element.get("id"),
        ),
    }


def _relation_to_obstacle(
    element: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
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
                "geometry": [
                    {"lat": point["lat"], "lon": point["lon"]}
                    for point in geometry
                ],
                "height": _parse_height(
                    element.get("tags", {}),
                    element.get("id"),
                ),
            }

    return None


async def fetch_building_obstacles(
    min_lat: float,
    min_lon: float,
    max_lat: float,
    max_lon: float,
) -> List[Dict[str, Any]]:
    query = _build_overpass_query(min_lat, min_lon, max_lat, max_lon)
    started_at = time.monotonic()
    bounding_box = (min_lat, min_lon, max_lat, max_lon)

    try:
        async with httpx.AsyncClient(timeout=OVERPASS_TIMEOUT) as client:
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
        logger.warning(
            "Overpass client timeout: endpoint=%s kind=%s "
            "elapsed=%.1fs bbox=%s",
            OVERPASS_URL,
            type(exc).__name__,
            time.monotonic() - started_at,
            bounding_box,
        )
        raise RuntimeError("timeout") from exc

    except httpx.HTTPStatusError as exc:
        status_code = exc.response.status_code

        logger.warning(
            "Overpass HTTP failure: endpoint=%s status=%s "
            "elapsed=%.1fs bbox=%s",
            OVERPASS_URL,
            status_code,
            time.monotonic() - started_at,
            bounding_box,
        )

        if status_code == 429:
            raise RuntimeError("rate_limited") from exc

        if status_code == 504:
            raise RuntimeError("timeout") from exc

        if status_code == 406:
            raise RuntimeError("not_acceptable") from exc

        raise RuntimeError(f"http_{status_code}") from exc

    except httpx.RequestError as exc:
        causes: List[str] = []
        current: Optional[BaseException] = exc

        for _ in range(6):
            if current is None:
                break

            causes.append(f"{type(current).__name__}: {current}")
            current = current.__cause__ or current.__context__

        logger.warning(
            "Overpass connection failure: endpoint=%s "
            "elapsed=%.1fs causes=%s",
            OVERPASS_URL,
            time.monotonic() - started_at,
            " -> ".join(causes),
        )
        raise RuntimeError("request_failed") from exc

    except ValueError as exc:
        logger.warning(
            "Overpass returned invalid JSON: endpoint=%s "
            "elapsed=%.1fs bbox=%s",
            OVERPASS_URL,
            time.monotonic() - started_at,
            bounding_box,
        )
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