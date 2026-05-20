import { useState } from 'react'
import MapView from '../components/MapView'
import axios from 'axios'
import { fetchObstacles } from '../services/obstacleApi'
import { createRectangleObstacle } from '../utils/manualObstacle'

const BACKEND_URL = 'http://127.0.0.1:8000'
const DRONE_HEIGHT = 18
const SAFETY_MARGIN = 5

function getObstacleHeight(obstacle) {
  const height = Number(obstacle.height || 0)

  if (height > 0) {
    return height
  }

  if (obstacle.type === 'building') {
    return 20
  }

  if (obstacle.type === 'restricted_zone') {
    return 100
  }

  return 15
}

function normalizeObstacle(obstacle) {
  return {
    id: obstacle.id || null,
    source: obstacle.source || 'user',
    type: obstacle.type || 'restricted_zone',
    height: getObstacleHeight(obstacle),
    geometry: (obstacle.geometry || []).map((point) => {
      if (Array.isArray(point)) {
        return point
      }

      return [point.lat, point.lon ?? point.lng]
    }),
  }
}

function formatDistance(distance) {
  if (!Number.isFinite(distance)) {
    return '0 m'
  }

  const meters = distance * 111_000

  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`
  }

  return `${meters.toFixed(1)} m`
}

function MapPage() {
  const [dronePoints, setDronePoints] = useState([])
  const [goalPoints, setGoalPoints] = useState([])
  const [multiRoutes, setMultiRoutes] = useState([])
  const [assignments, setAssignments] = useState([])

  const [placementMode, setPlacementMode] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [obstacles, setObstacles] = useState([])
  const [obstaclesLoading, setObstaclesLoading] = useState(false)
  const [obstaclesError, setObstaclesError] = useState('')

  const [manualObstacles, setManualObstacles] = useState([])
  const [isDrawingObstacle, setIsDrawingObstacle] = useState(false)
  const [pendingObstacleCorner, setPendingObstacleCorner] = useState(null)
  const [manualObstacleHeight, setManualObstacleHeight] = useState(0)

  const [currentBounds, setCurrentBounds] = useState(null)
  const [currentZoom, setCurrentZoom] = useState(13)

  const allObstacles = [...obstacles, ...manualObstacles]

  function clearRoutes() {
    setMultiRoutes([])
    setAssignments([])
  }

  function handleMapClick(latlng) {
    setError('')
    clearRoutes()

    if (isDrawingObstacle) {
      if (!pendingObstacleCorner) {
        setPendingObstacleCorner(latlng)
        return
      }

      const newObstacle = createRectangleObstacle(
        pendingObstacleCorner,
        latlng,
        Number(manualObstacleHeight) || 0
      )

      setManualObstacles((previous) => [...previous, newObstacle])
      setPendingObstacleCorner(null)
      setIsDrawingObstacle(false)
      return
    }

    if (placementMode === 'drone') {
      setDronePoints((previous) => [
        ...previous,
        { lat: latlng.lat, lon: latlng.lng },
      ])
      return
    }

    if (placementMode === 'goal') {
      setGoalPoints((previous) => [
        ...previous,
        { lat: latlng.lat, lon: latlng.lng },
      ])
    }
  }

  async function handleLoadObstacles() {
    if (!currentBounds) {
      setObstaclesError(
        'Map bounds are not ready yet. Move or zoom the map and try again.'
      )
      return
    }

    try {
      setObstaclesLoading(true)
      setObstaclesError('')

      const response = await fetchObstacles(currentBounds)
      setObstacles(response.obstacles || [])
      clearRoutes()
    } catch (err) {
      console.error(err)
      setObstaclesError('Obstacle loading failed. Check backend /obstacles route.')
    } finally {
      setObstaclesLoading(false)
    }
  }

  async function generateMultiRoute() {
    if (dronePoints.length === 0 || goalPoints.length === 0) {
      setError('Please place at least one drone and one goal.')
      return
    }

    if (dronePoints.length !== goalPoints.length) {
      setError('The number of drones must equal the number of goals.')
      return
    }

    try {
      setLoading(true)
      setError('')

      const body = {
        start_points: dronePoints.map((point) => ({
          lat: point.lat,
          lon: point.lon,
        })),
        goal_points: goalPoints.map((point) => ({
          lat: point.lat,
          lon: point.lon,
        })),
        obstacles: allObstacles.map(normalizeObstacle),
        drone_parameters: {
          height: DRONE_HEIGHT,
          safety_margin: SAFETY_MARGIN,
        },
      }

      const response = await axios.post(
        `${BACKEND_URL}/route/generate-multi`,
        body
      )

      const routeAssignments = response.data.assignments || []
      setMultiRoutes(routeAssignments)
      setAssignments(routeAssignments)
    } catch (err) {
      console.error(err.response?.data || err)
      setError(JSON.stringify(err.response?.data?.detail || err.message))
    } finally {
      setLoading(false)
    }
  }

  function handleClearPoints() {
    setDronePoints([])
    setGoalPoints([])
    clearRoutes()
    setError('')
  }

  function handleFullReset() {
    setDronePoints([])
    setGoalPoints([])
    setMultiRoutes([])
    setAssignments([])
    setObstacles([])
    setManualObstacles([])
    setPendingObstacleCorner(null)
    setIsDrawingObstacle(false)
    setPlacementMode(null)
    setError('')
    setObstaclesError('')
  }

  return (
    <div className="map-page">
      <header className="page-header">
        <h1>Multi-Drone Route Planner</h1>
        <p>
          Add drones and goals, load or draw obstacles, then generate optimized
          multi-drone routes.
        </p>
      </header>

      <section className="panel mission-controls-panel">
        <h2>Planner Controls</h2>

        <div className="mission-button-grid">
          <button
            className={
              placementMode === 'drone'
                ? 'mission-button mission-button-primary'
                : 'mission-button'
            }
            onClick={() => {
              setPlacementMode(placementMode === 'drone' ? null : 'drone')
              setIsDrawingObstacle(false)
              setPendingObstacleCorner(null)
            }}
            disabled={loading}
          >
            {placementMode === 'drone' ? 'Placing Drone...' : 'Add Drone'}
          </button>

          <button
            className={
              placementMode === 'goal'
                ? 'mission-button mission-button-primary'
                : 'mission-button'
            }
            onClick={() => {
              setPlacementMode(placementMode === 'goal' ? null : 'goal')
              setIsDrawingObstacle(false)
              setPendingObstacleCorner(null)
            }}
            disabled={loading}
          >
            {placementMode === 'goal' ? 'Placing Goal...' : 'Add Goal'}
          </button>

          <button
            className="mission-button"
            onClick={handleLoadObstacles}
            disabled={loading || obstaclesLoading || isDrawingObstacle}
          >
            {obstaclesLoading ? 'Loading Obstacles...' : 'Load Obstacles'}
          </button>

          <button
            className={
              isDrawingObstacle
                ? 'mission-button mission-button-primary'
                : 'mission-button'
            }
            onClick={() => {
              setIsDrawingObstacle((previous) => !previous)
              setPendingObstacleCorner(null)
              setPlacementMode(null)
            }}
            disabled={loading}
          >
            {isDrawingObstacle ? 'Cancel Drawing' : 'Draw Obstacle'}
          </button>

          <button
            className="mission-button"
            onClick={() => {
              setManualObstacles([])
              setPendingObstacleCorner(null)
              clearRoutes()
            }}
            disabled={loading || manualObstacles.length === 0}
          >
            Clear Manual
          </button>

          <button
            className="mission-button mission-button-primary"
            onClick={generateMultiRoute}
            disabled={
              loading ||
              dronePoints.length === 0 ||
              dronePoints.length !== goalPoints.length
            }
          >
            {loading ? 'Generating...' : 'Generate Multi-Route'}
          </button>

          <button
            className="mission-button"
            onClick={handleClearPoints}
            disabled={loading}
          >
            Clear Points
          </button>

          <button
            className="mission-button mission-button-danger"
            onClick={handleFullReset}
            disabled={loading}
          >
            Full Reset
          </button>
        </div>

        {isDrawingObstacle && (
          <label className="manual-height-input">
            Manual obstacle height (m):
            <input
              type="number"
              min="0"
              value={manualObstacleHeight}
              onChange={(event) => setManualObstacleHeight(event.target.value)}
              disabled={loading}
            />
          </label>
        )}
      </section>

      {error && <p className="error-message">{error}</p>}
      {obstaclesError && <p className="error-message">{obstaclesError}</p>}

      <section className="info-grid">
        <div className="panel info-panel">
          <h2>Multi-Drone Info</h2>
          <div className="info-list">
            <p><strong>Drones:</strong> {dronePoints.length}</p>
            <p><strong>Goals:</strong> {goalPoints.length}</p>
            <p><strong>OSM Obstacles:</strong> {obstacles.length}</p>
            <p><strong>Manual Obstacles:</strong> {manualObstacles.length}</p>
            <p><strong>Total Obstacles:</strong> {allObstacles.length}</p>
            <p><strong>Drone Height:</strong> {DRONE_HEIGHT} m</p>
            <p><strong>Safety Margin:</strong> {SAFETY_MARGIN} m</p>
            <p><strong>Zoom:</strong> {currentZoom}</p>
            <p>
              <strong>Mode:</strong>{' '}
              {isDrawingObstacle
                ? pendingObstacleCorner
                  ? 'Select second obstacle corner'
                  : 'Select first obstacle corner'
                : placementMode
                  ? `Placing ${placementMode}`
                  : 'Idle'}
            </p>
          </div>
        </div>

        <div className="panel route-panel">
          <h2>Assignments</h2>

          {assignments.length === 0 ? (
            <p>No assignments yet.</p>
          ) : (
            <ul>
              {assignments.map((assignment) => (
                <li key={`${assignment.drone_index}-${assignment.goal_index}`}>
                  Drone {assignment.drone_index + 1} → Goal{' '}
                  {assignment.goal_index + 1}
                  {assignment.distance !== undefined && (
                    <> | Distance: {formatDistance(assignment.distance)}</>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <MapView
        dronePoints={dronePoints}
        goalPoints={goalPoints}
        multiRoutes={multiRoutes}
        onMapClick={handleMapClick}
        obstacles={obstacles}
        manualObstacles={manualObstacles}
        setCurrentBounds={setCurrentBounds}
        setCurrentZoom={setCurrentZoom}
        dronePosition={null}
        droneAltitude={0}
      />
    </div>
  )
}

export default MapPage