import { useEffect } from 'react'
import { useMap } from 'react-leaflet'

function MapBoundsTracker({ setCurrentBounds, setCurrentZoom }) {
  const map = useMap()

  useEffect(() => {
    function updateMapState() {
      const bounds = map.getBounds()

      setCurrentBounds({
        minLat: bounds.getSouth(),
        minLon: bounds.getWest(),
        maxLat: bounds.getNorth(),
        maxLon: bounds.getEast(),
      })

      setCurrentZoom(map.getZoom())
    }

    updateMapState()
    map.on('moveend', updateMapState)

    return () => {
      map.off('moveend', updateMapState)
    }
  }, [map, setCurrentBounds, setCurrentZoom])

  return null
}

export default MapBoundsTracker