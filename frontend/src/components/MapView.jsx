import L from 'leaflet'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Polygon,
} from 'react-leaflet'
import MapClickHandler from './MapClickHandler'
import MapBoundsTracker from './MapBoundsTracker'

const droneIcon = L.divIcon({
  html: '<div class="drone-icon">✈️</div>',
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})

const goalIcon = L.divIcon({
  html: '<div class="goal-icon">🎯</div>',
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})

function MapView({
  startPoint,
  goalPoint,
  routeCoordinates = [],

  dronePoints = [],
  goalPoints = [],
  multiRoutes = [],
  droneSimStates = [],

  onMapClick,

  obstacles = [],
  manualObstacles = [],

  setCurrentBounds,
  setCurrentZoom,

  dronePosition,
  droneAltitude,
}) {
  const center = [47.4979, 19.0402]
  const zoom = 13

  const polylineColors = [
    '#e6194b',
    '#3cb44b',
    '#4363d8',
    '#f58231',
    '#911eb4',
    '#46f0f0',
    '#f032e6',
    '#bcf60c',
    '#fabebe',
    '#008080',
  ]

  function toLeafletPosition(point) {
    if (!point) {
      return null
    }

    return [point.lat, point.lon ?? point.lng]
  }

  function toPolygonPosition(point) {
    if (Array.isArray(point)) {
      return [point[0], point[1]]
    }

    return [point.lat, point.lon ?? point.lng]
  }

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      scrollWheelZoom={true}
      style={{ height: '600px', width: '100%' }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {onMapClick && <MapClickHandler onMapClick={onMapClick} />}

      {setCurrentBounds && setCurrentZoom && (
        <MapBoundsTracker
          setCurrentBounds={setCurrentBounds}
          setCurrentZoom={setCurrentZoom}
        />
      )}

      {dronePoints.length > 0
        ? dronePoints.map((point, index) => (
            <Marker
              key={`drone-${index}`}
              position={toLeafletPosition(point)}
              icon={droneIcon}
            >
              <Popup>Drone {index + 1}</Popup>
            </Marker>
          ))
        : startPoint && (
            <Marker position={toLeafletPosition(startPoint)} icon={droneIcon}>
              <Popup>Start Point</Popup>
            </Marker>
          )}

      {goalPoints.length > 0
        ? goalPoints.map((point, index) => (
            <Marker
              key={`goal-${index}`}
              position={toLeafletPosition(point)}
              icon={goalIcon}
            >
              <Popup>Goal {index + 1}</Popup>
            </Marker>
          ))
        : goalPoint && (
            <Marker position={toLeafletPosition(goalPoint)} icon={goalIcon}>
              <Popup>Goal Point</Popup>
            </Marker>
          )}

      {dronePosition && (
        <Marker position={toLeafletPosition(dronePosition)} icon={droneIcon}>
          <Popup>
            Drone Position
            <br />
            Altitude: {Number(droneAltitude || 0).toFixed(1)} m
          </Popup>
        </Marker>
      )}

      {droneSimStates
        .filter((drone) => drone.position)
        .map((drone) => (
          <Marker
            key={`sim-drone-${drone.id}`}
            position={toLeafletPosition(drone.position)}
            icon={droneIcon}
          >
            <Popup>
              Drone {drone.id + 1}
              <br />
              State: {drone.state}
              <br />
              Altitude: {Number(drone.altitude || 0).toFixed(1)} m
            </Popup>
          </Marker>
        ))}

      {multiRoutes.length > 0
        ? multiRoutes.map((assignment, index) => (
            <Polyline
              key={`multi-route-${index}`}
              positions={assignment.route_coordinates.map(([lat, lon]) => [
                lat,
                lon,
              ])}
              pathOptions={{
                color: polylineColors[index % polylineColors.length],
                weight: 4,
              }}
            />
          ))
        : routeCoordinates.length > 0 && (
            <Polyline positions={routeCoordinates} />
          )}

      {obstacles
        .filter((obstacle) => obstacle.geometry && obstacle.geometry.length >= 3)
        .map((obstacle, index) => (
          <Polygon
            key={obstacle.id || `obstacle-${index}`}
            positions={obstacle.geometry.map(toPolygonPosition)}
            pathOptions={{
              weight: 1,
              fillOpacity: 0.4,
            }}
          />
        ))}

      {manualObstacles
        .filter((obstacle) => obstacle.geometry && obstacle.geometry.length >= 3)
        .map((obstacle, index) => (
          <Polygon
            key={obstacle.id || `manual-obstacle-${index}`}
            positions={obstacle.geometry.map(toPolygonPosition)}
            pathOptions={{
              weight: 2,
              fillOpacity: 0.3,
            }}
          />
        ))}
    </MapContainer>
  )
}

export default MapView