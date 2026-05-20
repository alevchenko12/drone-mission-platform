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

function MapView({
  startPoint,
  goalPoint,
  routeCoordinates,
  onMapClick,
  obstacles,
  manualObstacles,
  setCurrentBounds,
  setCurrentZoom,
  dronePosition,
  droneAltitude,
}) {
  const center = [47.4979, 19.0402]
  const zoom = 13

  return (
    <MapContainer center={center} zoom={zoom} scrollWheelZoom={true}>
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapClickHandler onMapClick={onMapClick} />

      <MapBoundsTracker
        setCurrentBounds={setCurrentBounds}
        setCurrentZoom={setCurrentZoom}
      />

      {startPoint && (
        <Marker position={startPoint}>
          <Popup>Start Point</Popup>
        </Marker>
      )}

      {goalPoint && (
        <Marker position={goalPoint}>
          <Popup>Goal Point</Popup>
        </Marker>
      )}

      {dronePosition && (
        <Marker position={dronePosition} icon={droneIcon}>
          <Popup>
            Drone Position
            <br />
            Altitude: {Number(droneAltitude || 0).toFixed(1)} m
          </Popup>
        </Marker>
      )}

      {routeCoordinates.length > 0 && (
        <Polyline positions={routeCoordinates} />
      )}

      {obstacles
        .filter((obstacle) => obstacle.geometry && obstacle.geometry.length >= 3)
        .map((obstacle) => (
          <Polygon
            key={obstacle.id}
            positions={obstacle.geometry.map((point) => [point.lat, point.lon])}
            pathOptions={{
              weight: 1,
              fillOpacity: 0.4,
            }}
          />
        ))}

      {manualObstacles
        .filter((obstacle) => obstacle.geometry && obstacle.geometry.length >= 3)
        .map((obstacle) => (
          <Polygon
            key={obstacle.id}
            positions={obstacle.geometry.map((point) => [point.lat, point.lon])}
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