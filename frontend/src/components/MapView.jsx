import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
} from 'react-leaflet'
import MapClickHandler from './MapClickHandler'

function MapView({
  startPoint,
  goalPoint,
  routeCoordinates,
  onMapClick,
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

      {routeCoordinates.length > 0 && (
        <Polyline positions={routeCoordinates} />
      )}
    </MapContainer>
  )
}

export default MapView