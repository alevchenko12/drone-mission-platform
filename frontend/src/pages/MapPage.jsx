import { useRef, useState } from 'react'
import MapView from '../components/MapView'
import axios from 'axios'
import { fetchObstacles } from '../services/obstacleApi'
import { createRectangleObstacle } from '../utils/manualObstacle'

const BACKEND_URL = 'http://127.0.0.1:8000'
const DRONE_HEIGHT = 14
const SAFETY_MARGIN = 5
const DRONE_SPEED_MPS = 8
const UPDATE_INTERVAL_MS = 200

function getObstacleHeight(obstacle) {
  const height = Number(obstacle.height || 0)

  if (height > 0) return height
  if (obstacle.type === 'building') return 20
  if (obstacle.type === 'restricted_zone') return 100

  return 15
}

function normalizeObstacle(obstacle) {
  return {
    id: obstacle.id || null,
    source: obstacle.source || 'user',
    type: obstacle.type || 'restricted_zone',
    height: getObstacleHeight(obstacle),
    geometry: (obstacle.geometry || []).map((point) => {
      if (Array.isArray(point)) return point
      return [point.lat, point.lon ?? point.lng]
    }),
  }
}

function toRadians(value) {
  return (value * Math.PI) / 180
}

function calculateDistanceMeters(a, b) {
  const earthRadius = 6371000
  const dLat = toRadians(b.lat - a.lat)
  const dLon = toRadians(b.lon - a.lon)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2

  return earthRadius * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

function calculateRouteLength(route) {
  let distance = 0

  for (let i = 0; i < route.length - 1; i += 1) {
    distance += calculateDistanceMeters(route[i], route[i + 1])
  }

  return distance
}

function formatDistance(distance) {
  if (!Number.isFinite(distance) || distance <= 0) return '0 m'
  if (distance >= 1000) return `${(distance / 1000).toFixed(2)} km`
  return `${Math.round(distance)} m`
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

  const [missionState, setMissionState] = useState('idle')
  const [droneSimStates, setDroneSimStates] = useState([])
  const [showProgress, setShowProgress] = useState(false)

  const simulationRef = useRef(null)

  const allObstacles = [...obstacles, ...manualObstacles]

  function stopSimulation() {
    if (simulationRef.current) {
      clearInterval(simulationRef.current)
      simulationRef.current = null
    }
  }

  function clearRoutes() {
    stopSimulation()
    setMultiRoutes([])
    setAssignments([])
    setDroneSimStates([])
    setMissionState('idle')
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

      if (response.source_status === 'rate_limited') {
        setObstaclesError(
          'Obstacle service is temporarily rate-limited. Keeping previous obstacles.'
        )
        return
      }

      if (response.source_status === 'timeout') {
        setObstaclesError(
          'Obstacle service timed out. Keeping previous obstacles.'
        )
        return
      }

      if (response.source_status === 'error') {
        setObstaclesError('Obstacle loading failed. Keeping previous obstacles.')
        return
      }

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
      stopSimulation()

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
      setDroneSimStates([])
      setMissionState('idle')
    } catch (err) {
      console.error(err.response?.data || err)
      setError(JSON.stringify(err.response?.data?.detail || err.message))
    } finally {
      setLoading(false)
    }
  }

  function createSimulationStates() {
    return assignments.map((assignment) => {
      const route = assignment.route_coordinates.map(([lat, lon]) => ({
        lat,
        lon,
      }))

      return {
        id: assignment.drone_index,
        goalIndex: assignment.goal_index,
        route,
        totalDistance: calculateRouteLength(route),
        distanceTraveled: 0,
        currentSegmentIndex: 0,
        segmentDistance: 0,
        position: route[0],
        altitude: 0,
        state: 'flying',
      }
    })
  }

  function updateSimulationStep() {
    setDroneSimStates((previousStates) => {
      let allCompleted = true

      const nextStates = previousStates.map((drone) => {
        if (drone.state === 'completed' || drone.state === 'landed') {
          return drone
        }

        const route = drone.route

        if (drone.currentSegmentIndex >= route.length - 1) {
          return {
            ...drone,
            position: route[route.length - 1],
            altitude: 0,
            state: 'completed',
            distanceTraveled: drone.totalDistance,
          }
        }

        allCompleted = false

        let remainingMove = (DRONE_SPEED_MPS * UPDATE_INTERVAL_MS) / 1000
        let segmentIndex = drone.currentSegmentIndex
        let segmentDistance = drone.segmentDistance
        let distanceTraveled = drone.distanceTraveled

        while (remainingMove > 0 && segmentIndex < route.length - 1) {
          const start = route[segmentIndex]
          const end = route[segmentIndex + 1]
          const segmentLength = calculateDistanceMeters(start, end)
          const remainingSegment = segmentLength - segmentDistance

          if (remainingMove >= remainingSegment) {
            remainingMove -= remainingSegment
            distanceTraveled += remainingSegment
            segmentIndex += 1
            segmentDistance = 0
          } else {
            segmentDistance += remainingMove
            distanceTraveled += remainingMove
            remainingMove = 0
          }
        }

        if (segmentIndex >= route.length - 1) {
          return {
            ...drone,
            currentSegmentIndex: segmentIndex,
            segmentDistance: 0,
            distanceTraveled: drone.totalDistance,
            position: route[route.length - 1],
            altitude: 0,
            state: 'completed',
          }
        }

        const segmentStart = route[segmentIndex]
        const segmentEnd = route[segmentIndex + 1]
        const segmentLength = calculateDistanceMeters(segmentStart, segmentEnd)
        const ratio = segmentLength > 0 ? segmentDistance / segmentLength : 1

        const position = {
          lat: segmentStart.lat + (segmentEnd.lat - segmentStart.lat) * ratio,
          lon: segmentStart.lon + (segmentEnd.lon - segmentStart.lon) * ratio,
        }

        const altitude = Math.min(
          DRONE_HEIGHT,
          drone.altitude + (DRONE_HEIGHT / 10) * (UPDATE_INTERVAL_MS / 1000)
        )

        return {
          ...drone,
          currentSegmentIndex: segmentIndex,
          segmentDistance,
          distanceTraveled,
          position,
          altitude,
          state: 'flying',
        }
      })

      if (allCompleted) {
        stopSimulation()
        setMissionState('completed')
      }

      return nextStates
    })
  }

  function handleStartMission() {
    if (assignments.length === 0) {
      setError('Generate routes before starting mission.')
      return
    }

    stopSimulation()
    setDroneSimStates(createSimulationStates())
    setMissionState('running')

    simulationRef.current = setInterval(
      updateSimulationStep,
      UPDATE_INTERVAL_MS
    )
  }

  function handlePauseMission() {
    if (missionState !== 'running') return

    stopSimulation()
    setMissionState('paused')
  }

  function handleResumeMission() {
    if (missionState !== 'paused') return

    setMissionState('running')
    simulationRef.current = setInterval(
      updateSimulationStep,
      UPDATE_INTERVAL_MS
    )
  }

  function handleLandMission() {
    if (missionState !== 'running' && missionState !== 'paused') return

    stopSimulation()

    setDroneSimStates((previous) =>
      previous.map((drone) => ({
        ...drone,
        altitude: 0,
        state: 'landed',
      }))
    )

    setMissionState('landed')
  }

  function handleReturnHome() {
    if (droneSimStates.length === 0) {
      setError('Start or complete a mission before return home.')
      return
    }

    stopSimulation()

    const returnStates = droneSimStates.map((drone) => {
      const reversedRoute = [...drone.route].reverse()

      return {
        ...drone,
        route: reversedRoute,
        totalDistance: calculateRouteLength(reversedRoute),
        distanceTraveled: 0,
        currentSegmentIndex: 0,
        segmentDistance: 0,
        position: reversedRoute[0],
        altitude: 0,
        state: 'flying',
      }
    })

    setDroneSimStates(returnStates)
    setMissionState('running')

    simulationRef.current = setInterval(
      updateSimulationStep,
      UPDATE_INTERVAL_MS
    )
  }

  function handleClearPoints() {
    stopSimulation()
    setDronePoints([])
    setGoalPoints([])
    clearRoutes()
    setError('')
  }

  function handleFullReset() {
    stopSimulation()
    setDronePoints([])
    setGoalPoints([])
    setMultiRoutes([])
    setAssignments([])
    setDroneSimStates([])
    setObstacles([])
    setManualObstacles([])
    setPendingObstacleCorner(null)
    setIsDrawingObstacle(false)
    setPlacementMode(null)
    setMissionState('idle')
    setError('')
    setObstaclesError('')
  }

  const canStartMission =
    assignments.length > 0 &&
    (missionState === 'idle' ||
      missionState === 'completed' ||
      missionState === 'landed')

  const canPauseMission = missionState === 'running'
  const canResumeMission = missionState === 'paused'
  const canLandMission = missionState === 'running' || missionState === 'paused'
  const canReturnHome =
    droneSimStates.length > 0 &&
    (missionState === 'completed' || missionState === 'landed')

  return (
    <div className="map-page">
      <header className="page-header">
        <h1>Multi-Drone Route Planner</h1>
        <p>
          Add drones and goals, load or draw obstacles, generate routes, then
          start real-time multi-drone simulation.
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
            disabled={loading || missionState === 'running'}
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
            disabled={loading || missionState === 'running'}
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
            disabled={loading || missionState === 'running'}
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
              missionState === 'running' ||
              dronePoints.length === 0 ||
              dronePoints.length !== goalPoints.length
            }
          >
            {loading ? 'Generating...' : 'Generate Multi-Route'}
          </button>

          <button
            className="mission-button"
            onClick={handleStartMission}
            disabled={!canStartMission}
          >
            Start
          </button>

          <button
            className="mission-button"
            onClick={handlePauseMission}
            disabled={!canPauseMission}
          >
            Pause
          </button>

          <button
            className="mission-button"
            onClick={handleResumeMission}
            disabled={!canResumeMission}
          >
            Resume
          </button>

          <button
            className="mission-button mission-button-danger"
            onClick={handleLandMission}
            disabled={!canLandMission}
          >
            Land
          </button>

          <button
            className="mission-button"
            onClick={handleReturnHome}
            disabled={!canReturnHome}
          >
            Return Home
          </button>

          <button
            className="mission-button"
            onClick={handleClearPoints}
            disabled={loading || missionState === 'running'}
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
          <h2>Mission Info</h2>
          <div className="info-list">
            <p>
              <strong>Mission State:</strong> {missionState}
            </p>
            <p>
              <strong>Drones:</strong> {dronePoints.length}
            </p>
            <p>
              <strong>Goals:</strong> {goalPoints.length}
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
              <strong>Drone Height:</strong> {DRONE_HEIGHT} m
            </p>
            <p>
              <strong>Safety Margin:</strong> {SAFETY_MARGIN} m
            </p>
            <p>
              <strong>Zoom:</strong> {currentZoom}
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
                </li>
              ))}
            </ul>
          )}

          <button
            className="mission-button"
            onClick={() => setShowProgress((previous) => !previous)}
            disabled={droneSimStates.length === 0}
          >
            {showProgress ? 'Hide Progress' : 'Show Progress'}
          </button>

          {showProgress && droneSimStates.length > 0 && (
            <ul className="progress-list">
              {droneSimStates.map((drone) => {
                const remaining = Math.max(
                  0,
                  drone.totalDistance - drone.distanceTraveled
                )

                const progress =
                  drone.totalDistance > 0
                    ? Math.min(
                        100,
                        (drone.distanceTraveled / drone.totalDistance) * 100
                      )
                    : 0

                return (
                  <li key={`progress-${drone.id}`}>
                    Drone {drone.id + 1}: {drone.state} | Progress:{' '}
                    {progress.toFixed(1)}% | Remaining:{' '}
                    {formatDistance(remaining)} | Altitude:{' '}
                    {drone.altitude.toFixed(1)} m
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      <MapView
        dronePoints={dronePoints}
        goalPoints={goalPoints}
        multiRoutes={multiRoutes}
        droneSimStates={droneSimStates}
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