import { useEffect, useRef, useState } from 'react'
import MapView from '../components/MapView'
import { generateRoute } from '../services/routeApi'
import { createRectangleObstacle } from '../utils/manualObstacle'
import { fetchObstacles } from '../services/obstacleApi'

const BASE_ALTITUDE = 18
const SAFETY_MARGIN = 5
const OBSTACLE_NEAR_DISTANCE = 0.00015
const SIMULATION_STEP_MS = 900

function getObstacleCenter(obstacle) {
  const points = obstacle.geometry || []

  if (points.length === 0) {
    return null
  }

  const lat =
    points.reduce((sum, point) => sum + point.lat, 0) / points.length

  const lon =
    points.reduce((sum, point) => sum + (point.lon ?? point.lng), 0) /
    points.length

  return { lat, lon }
}

function getDistance(pointA, pointB) {
  const latDiff = pointA.lat - pointB.lat
  const lonDiff = pointA.lon - pointB.lon

  return Math.sqrt(latDiff * latDiff + lonDiff * lonDiff)
}

function calculateDroneAltitude(position, obstacles) {
  let altitude = BASE_ALTITUDE

  for (const obstacle of obstacles) {
    if (!obstacle.geometry || obstacle.geometry.length === 0) {
      continue
    }

    const center = getObstacleCenter(obstacle)

    if (!center) {
      continue
    }

    const distance = getDistance(
      { lat: position.lat, lon: position.lng },
      center
    )

    if (distance <= OBSTACLE_NEAR_DISTANCE) {
      const requiredAltitude = (obstacle.height || 0) + SAFETY_MARGIN
      altitude = Math.max(altitude, requiredAltitude)
    }
  }

  return altitude
}

function MapPage() {
  const [startPoint, setStartPoint] = useState(null)
  const [goalPoint, setGoalPoint] = useState(null)
  const [routeCoordinates, setRouteCoordinates] = useState([])
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

  const [simulationIndex, setSimulationIndex] = useState(0)
  const [simulationRunning, setSimulationRunning] = useState(false)
  const [simulationPaused, setSimulationPaused] = useState(false)
  const [dronePosition, setDronePosition] = useState(null)
  const [droneAltitude, setDroneAltitude] = useState(BASE_ALTITUDE)

  const intervalRef = useRef(null)

  const allObstacles = [...obstacles, ...manualObstacles]

  function stopSimulationTimer() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  function moveSimulationStep() {
    setSimulationIndex((previousIndex) => {
      const nextIndex = previousIndex + 1

      if (nextIndex >= routeCoordinates.length) {
        stopSimulationTimer()
        setSimulationRunning(false)
        setSimulationPaused(false)
        return previousIndex
      }

      const [lat, lon] = routeCoordinates[nextIndex]
      const nextPosition = { lat, lng: lon }

      setDronePosition(nextPosition)
      setDroneAltitude(calculateDroneAltitude(nextPosition, allObstacles))

      return nextIndex
    })
  }

  function startSimulationTimer() {
    stopSimulationTimer()
    intervalRef.current = setInterval(moveSimulationStep, SIMULATION_STEP_MS)
  }

  function resetSimulationState() {
    stopSimulationTimer()
    setSimulationIndex(0)
    setSimulationRunning(false)
    setSimulationPaused(false)
    setDronePosition(null)
    setDroneAltitude(BASE_ALTITUDE)
  }

  function handleMapClick(latlng) {
    setError('')
    setRouteCoordinates([])
    resetSimulationState()

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

      setManualObstacles((previousObstacles) => [
        ...previousObstacles,
        newObstacle,
      ])
      setPendingObstacleCorner(null)
      setIsDrawingObstacle(false)
      return
    }

    if (!startPoint) {
      setStartPoint(latlng)
      return
    }

    if (!goalPoint) {
      setGoalPoint(latlng)
      return
    }

    setGoalPoint(latlng)
  }

  async function handleGenerateRoute() {
    if (!startPoint || !goalPoint) {
      setError('Please select both a start point and a goal point.')
      return
    }

    try {
      setLoading(true)
      setError('')
      resetSimulationState()

      const data = await generateRoute(startPoint, goalPoint, allObstacles)
      setRouteCoordinates(data.route_coordinates)
    } catch (err) {
      setError('Could not generate route. Check backend connection.')
    } finally {
      setLoading(false)
    }
  }

  async function handleLoadObstacles() {
    if (!currentBounds) {
      setObstaclesError('Map bounds are not ready yet. Move or zoom the map and try again.')
      return
    }

    try {
      setObstaclesLoading(true)
      setObstaclesError('')

      const response = await fetchObstacles(currentBounds)

      if (response.source_status === 'rate_limited') {
        setObstaclesError(
          'Obstacle service is temporarily rate-limited. Keeping previous obstacles.'
        )
        return
      }

      if (response.source_status === 'timeout') {
        setObstaclesError('Obstacle service timed out. Keeping previous obstacles.')
        return
      }

      if (response.source_status === 'error') {
        setObstaclesError('Obstacle loading failed. Keeping previous obstacles.')
        return
      }

      setObstacles(response.obstacles || [])
      resetSimulationState()
    } catch (err) {
      setObstaclesError('Obstacle loading failed. Keeping previous obstacles.')
    } finally {
      setObstaclesLoading(false)
    }
  }

  function handleStartSimulation() {
    if (!routeCoordinates || routeCoordinates.length === 0) {
      setError('Generate a route before starting simulation.')
      return
    }

    const [lat, lon] = routeCoordinates[0]
    const firstPosition = { lat, lng: lon }

    setError('')
    setSimulationIndex(0)
    setSimulationRunning(true)
    setSimulationPaused(false)
    setDronePosition(firstPosition)
    setDroneAltitude(calculateDroneAltitude(firstPosition, allObstacles))

    startSimulationTimer()
  }

  function handlePauseSimulation() {
    stopSimulationTimer()
    setSimulationRunning(false)
    setSimulationPaused(true)
  }

  function handleResumeSimulation() {
    if (!simulationPaused) {
      return
    }

    setSimulationRunning(true)
    setSimulationPaused(false)
    startSimulationTimer()
  }

  function handleResetSimulation() {
    resetSimulationState()
  }

  function handleReset() {
    setStartPoint(null)
    setGoalPoint(null)
    setRouteCoordinates([])
    setError('')
    setObstaclesError('')
    setManualObstacles([])
    setPendingObstacleCorner(null)
    setIsDrawingObstacle(false)
    resetSimulationState()
  }

  useEffect(() => {
    return () => {
      stopSimulationTimer()
    }
  }, [])

  const simulationProgress =
    routeCoordinates.length > 1
      ? (simulationIndex / (routeCoordinates.length - 1)) * 100
      : 0

  return (
    <div className="map-page">
      <h1>Drone Route Planner</h1>
      <p>Click once for start, click again for goal, then generate route.</p>

      <div className="controls">
        <button
          onClick={handleLoadObstacles}
          disabled={loading || isDrawingObstacle || simulationRunning}
        >
          {obstaclesLoading ? 'Loading Obstacles...' : 'Load Obstacles'}
        </button>

        <button
          onClick={handleGenerateRoute}
          disabled={loading || simulationRunning}
        >
          {loading ? 'Generating...' : 'Generate Route'}
        </button>

        <button onClick={handleReset} disabled={loading || simulationRunning}>
          Reset
        </button>

        <button
          onClick={() => {
            setIsDrawingObstacle((previousValue) => !previousValue)
            setPendingObstacleCorner(null)
          }}
          disabled={loading || simulationRunning}
        >
          {isDrawingObstacle ? 'Cancel Obstacle' : 'Draw Obstacle'}
        </button>

        {isDrawingObstacle && (
          <label>
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

        <button
          onClick={() => {
            setManualObstacles([])
            setPendingObstacleCorner(null)
            resetSimulationState()
          }}
          disabled={loading || simulationRunning}
        >
          Clear Manual Obstacles
        </button>
      </div>

      <div className="simulation-controls">
        {!simulationRunning && !simulationPaused && (
          <button
            onClick={handleStartSimulation}
            disabled={routeCoordinates.length === 0 || isDrawingObstacle}
          >
            Start Simulation
          </button>
        )}

        {simulationRunning && (
          <button onClick={handlePauseSimulation}>Pause</button>
        )}

        {simulationPaused && (
          <button onClick={handleResumeSimulation}>Resume</button>
        )}

        {(simulationRunning || simulationPaused || dronePosition) && (
          <button onClick={handleResetSimulation}>Reset Simulation</button>
        )}
      </div>

      {error && <p className="error-message">{error}</p>}
      {obstaclesError && <p className="error-message">{obstaclesError}</p>}
      {obstaclesLoading && <p>Loading obstacles...</p>}

      <div className="status-panel">
        <p>
          <strong>Start:</strong>{' '}
          {startPoint
            ? `${startPoint.lat.toFixed(5)}, ${startPoint.lng.toFixed(5)}`
            : 'Not selected'}
        </p>

        <p>
          <strong>Goal:</strong>{' '}
          {goalPoint
            ? `${goalPoint.lat.toFixed(5)}, ${goalPoint.lng.toFixed(5)}`
            : 'Not selected'}
        </p>

        <p>
          <strong>OSM Obstacles:</strong> {obstacles.length}
        </p>

        <p>
          <strong>Manual Obstacles:</strong> {manualObstacles.length}
        </p>

        <p>
          <strong>Total Obstacles:</strong> {allObstacles.length}
        </p>

        <p>
          <strong>Zoom:</strong> {currentZoom}
        </p>

        <p>
          <strong>Mode:</strong>{' '}
          {isDrawingObstacle
            ? pendingObstacleCorner
              ? 'Select second corner'
              : 'Select first corner'
            : simulationRunning
              ? 'Simulation running'
              : simulationPaused
                ? 'Simulation paused'
                : 'Route selection'}
        </p>

        <p>
          <strong>Simulation Progress:</strong> {simulationProgress.toFixed(1)}%
        </p>

        <p>
          <strong>Drone Position:</strong>{' '}
          {dronePosition
            ? `${dronePosition.lat.toFixed(5)}, ${dronePosition.lng.toFixed(5)}`
            : 'Not active'}
        </p>

        <p>
          <strong>Drone Altitude:</strong> {droneAltitude.toFixed(1)} m
        </p>
      </div>

      <MapView
        startPoint={startPoint}
        goalPoint={goalPoint}
        routeCoordinates={routeCoordinates}
        onMapClick={handleMapClick}
        obstacles={obstacles}
        manualObstacles={manualObstacles}
        setCurrentBounds={setCurrentBounds}
        setCurrentZoom={setCurrentZoom}
        dronePosition={dronePosition}
      />
    </div>
  )
}

export default MapPage