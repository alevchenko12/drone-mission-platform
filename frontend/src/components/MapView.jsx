import { MapContainer, TileLayer } from 'react-leaflet'

function MapView() {
  const center = [47.4979, 19.0402]
  const zoom = 13

  return (
    <MapContainer center={center} zoom={zoom} scrollWheelZoom={true}>
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
    </MapContainer>
  )
}

export default MapView