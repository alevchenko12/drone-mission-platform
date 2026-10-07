import { useMapEvents } from 'react-leaflet'
import type { LatLng } from 'leaflet'

interface MapClickHandlerProps {
  onMapClick: (point: LatLng) => void;
}

function MapClickHandler({ onMapClick }: MapClickHandlerProps) {
  useMapEvents({
    click(event) {
      onMapClick(event.latlng)
    },
  })

  return null
}

export default MapClickHandler