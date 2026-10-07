import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import { fetchObstacles } from '../services/obstacleApi'
import type { Obstacle } from '../types/obstacle'

interface ObstacleLoaderProps {
  setObstacles: (obstacles: Obstacle[]) => void;
  setObstaclesLoading: (loading: boolean) => void;
  setObstaclesError: (message: string) => void;
}

function ObstacleLoader({
  setObstacles,
  setObstaclesLoading,
  setObstaclesError,
}: ObstacleLoaderProps) {
  const map = useMap()

  useEffect(() => {
    let isMounted = true
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    async function loadObstacles() {
      try {
        if (!isMounted) return

        setObstaclesLoading(true)
        setObstaclesError('')

        const zoom = map.getZoom()

        if (zoom < 7) {
          setObstacles([])
          setObstaclesLoading(false)
          return
        }

        const bounds = map.getBounds()

        const response = await fetchObstacles({
          minLat: bounds.getSouth(),
          minLon: bounds.getWest(),
          maxLat: bounds.getNorth(),
          maxLon: bounds.getEast(),
        })

        if (isMounted) {
          setObstacles(response.obstacles || [])
        }
      } catch (error) {
        if (isMounted) {
          setObstaclesError(
            error instanceof Error && error.message
              ? error.message
              : 'Failed to load obstacles.',
          )
        }
      } finally {
        if (isMounted) {
          setObstaclesLoading(false)
        }
      }
    }

    function scheduleLoad() {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }

      timeoutId = setTimeout(() => {
        void loadObstacles()
      }, 400)
    }

    scheduleLoad()
    map.on('moveend', scheduleLoad)

    return () => {
      isMounted = false
      map.off('moveend', scheduleLoad)

      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
    }
  }, [map, setObstacles, setObstaclesLoading, setObstaclesError])

  return null
}

export default ObstacleLoader