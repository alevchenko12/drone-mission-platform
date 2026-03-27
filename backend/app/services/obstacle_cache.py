import time
from typing import Any, Dict, Optional, Tuple


CACHE_TTL_SECONDS = 300  # 5 minutes
RATE_LIMIT_COOLDOWN_SECONDS = 60  # wait 1 minute after Overpass 429

_cache: Dict[Tuple[float, float, float, float], Dict[str, Any]] = {}
_rate_limit_until: float = 0.0


def make_cache_key(
    min_lat: float,
    min_lon: float,
    max_lat: float,
    max_lon: float,
    precision: int = 3,
) -> Tuple[float, float, float, float]:
    return (
        round(min_lat, precision),
        round(min_lon, precision),
        round(max_lat, precision),
        round(max_lon, precision),
    )


def get_cached_obstacles(key: Tuple[float, float, float, float]) -> Optional[Dict[str, Any]]:
    entry = _cache.get(key)
    if not entry:
      return None

    if time.time() - entry["timestamp"] > CACHE_TTL_SECONDS:
        del _cache[key]
        return None

    return entry


def set_cached_obstacles(key: Tuple[float, float, float, float], obstacles: list) -> None:
    _cache[key] = {
        "timestamp": time.time(),
        "obstacles": obstacles,
    }


def set_rate_limited() -> None:
    global _rate_limit_until
    _rate_limit_until = time.time() + RATE_LIMIT_COOLDOWN_SECONDS


def is_rate_limited() -> bool:
    return time.time() < _rate_limit_until


def get_rate_limit_remaining_seconds() -> int:
    remaining = int(_rate_limit_until - time.time())
    return max(0, remaining)