import { useEffect, useRef, useState } from 'react'
import MapView from '../components/MapView'
import { generateRoute } from '../services/routeApi'
import { createRectangleObstacle } from '../utils/manualObstacle'
import { fetchObstacles } from '../services/obstacleApi'

const BASE_ALTITUDE = 18
const SAFETY_MARGIN = 5
const DRONE_SPEED_MPS = 5
const SIMULATION_STEP_MS = 100
const TAKEOFF_DURATION_MS = 3000
const LANDING_DURATION_MS = 3000
const OBSTACLE_NEAR_DISTANCE_METERS = 25

function toRadians(degrees) {
  return (degrees * Math.PI) / 180
}

function calculateDistanceMeters(pointA, pointB) {
  const earthRadiusMeters = 6371000

  const lat1 = toRadians(pointA.lat)
  const lat2 = toRadians(pointB.lat)
  const latDiff = toRadians(pointB.lat - pointA.lat)
  const lonDiff = toRadians(pointB.lon - pointA.lon)

  const a =
    Math.sin(latDiff / 2) * Math.sin(latDiff / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(lonDiff / 2) *
      Math.sin(lonDiff / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return earthRadiusMeters * c
}

function interpolatePosition(start, end, ratio) {
  return {
    lat: start.lat + (end.lat - start.lat) * ratio,
    lon: start.lon + (end.lon - start.lon) * ratio,
  }
}

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

function calculateRequiredAltitude(position, obstacles) {
  let altitude = BASE_ALTITUDE

  for (const obstacle of obstacles) {
    if (!obstacle.geometry || obstacle.geometry.length === 0) {
      continue
    }

    const center = getObstacleCenter(obstacle)

    if (!center) {
      continue
    }

    const distance = calculateDistanceMeters(
      { lat: position.lat, lon: position.lon },
      center
    )

    if (distance <= OBSTACLE_NEAR_DISTANCE_METERS) {
      const requiredAltitude = (obstacle.height || 0) + SAFETY_MARGIN
      altitude = Math.max(altitude, requiredAltitude)
    }
  }

  return altitude
}

function moveAltitudeSmoothly(currentAltitude, targetAltitude) {
  const maxAltitudeChangePerStep = 0.5
  const difference = targetAltitude - currentAltitude

  if (Math.abs(difference) <= maxAltitudeChangePerStep) {
    return targetAltitude
  }

  return currentAltitude + Math.sign(difference) * maxAltitudeChangePerStep
}

function createRouteSegments(routeCoordinates) {
  const segments = []
  let totalDistance = 0

  for (let index = 0; index < routeCoordinates.length - 1; index += 1) {
    const [startLat, startLon] = routeCoordinates[index]
    const [endLat, endLon] = routeCoordinates[index + 1]

    const start = { lat: startLat, lon: startLon }
    const end = { lat: endLat, lon: endLon }
    const distance = calculateDistanceMeters(start, end)

    segments.push({
      start,
      end,
      distance,
    })

    totalDistance += distance
  }

  return {
    segments,
    totalDistance,
  }
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0s'
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)

  if (minutes <= 0) {
    return `${remainingSeconds}s`
  }

  return `${minutes}m ${remainingSeconds}s`
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

  const [missionState, setMissionState] = useState('idle')
  const [dronePosition, setDronePosition] = useState(null)
  const [droneAltitude, setDroneAltitude] = useState(0)
  const [simulationProgress, setSimulationProgress] = useState(0)
  const [totalDistance, setTotalDistance] = useState(0)
  const [travelledDistance, setTravelledDistance] = useState(0)
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState(0)

  const intervalRef = useRef(null)
  const routeSegmentsRef = useRef([])
  const segmentIndexRef = useRef(0)
  const distanceInSegmentRef = useRef(0)
  const travelledDistanceRef = useRef(0)
  const takeoffElapsedRef = useRef(0)
  const landingElapsedRef = useRef(0)
  const landingStartAltitudeRef = useRef(0)
  const missionStateRef = useRef('idle')
  const droneAltitudeRef = useRef(0)

  const allObstacles = [...obstacles, ...manualObstacles]

  function setMissionStateValue(value) {
    missionStateRef.current = value
    setMissionState(value)
  }

  function setDroneAltitudeValue(value) {
    droneAltitudeRef.current = value
    setDroneAltitude(value)
  }

  function stopSimulationTimer() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  function resetSimulationState() {
    stopSimulationTimer()

    segmentIndexRef.current = 0
    distanceInSegmentRef.current = 0
    travelledDistanceRef.current = 0
    takeoffElapsedRef.current = 0
    landingElapsedRef.current = 0
    landingStartAltitudeRef.current = 0
    missionStateRef.current = 'idle'
    droneAltitudeRef.current = 0

    setMissionState('idle')
    setDronePosition(null)
    setDroneAltitude(0)
    setSimulationProgress(0)
    setTravelledDistance(0)
    setEstimatedTimeRemaining(0)
  }

  function updateSimulationStep() {
    const currentMissionState = missionStateRef.current
    const stepSeconds = SIMULATION_STEP_MS / 1000

    if (currentMissionState === 'taking_off') {
      takeoffElapsedRef.current += SIMULATION_STEP_MS

      const ratio = Math.min(
        takeoffElapsedRef.current / TAKEOFF_DURATION_MS,
        1
      )

      setDroneAltitudeValue(BASE_ALTITUDE * ratio)

      if (ratio >= 1) {
        setMissionStateValue('flying')
      }

      setEstimatedTimeRemaining(
        Math.max(
          0,
          (totalDistance - travelledDistanceRef.current) / DRONE_SPEED_MPS +
            LANDING_DURATION_MS / 1000
        )
      )

      return
    }

    if (currentMissionState === 'landing') {
      landingElapsedRef.current += SIMULATION_STEP_MS

      const ratio = Math.min(
        landingElapsedRef.current / LANDING_DURATION_MS,
        1
      )

      const nextAltitude =
        landingStartAltitudeRef.current * (1 - ratio)

      setDroneAltitudeValue(nextAltitude)

      if (ratio >= 1) {
        setDroneAltitudeValue(0)
        setSimulationProgress(100)
        setEstimatedTimeRemaining(0)
        setMissionStateValue('completed')
        stopSimulationTimer()
      }

      return
    }

    if (currentMissionState !== 'flying') {
      return
    }

    let remainingMoveDistance = DRONE_SPEED_MPS * stepSeconds
    let currentSegmentIndex = segmentIndexRef.current
    let currentDistanceInSegment = distanceInSegmentRef.current
    let currentTravelledDistance = travelledDistanceRef.current

    while (
      remainingMoveDistance > 0 &&
      currentSegmentIndex < routeSegmentsRef.current.length
    ) {
      const currentSegment = routeSegmentsRef.current[currentSegmentIndex]
      const remainingSegmentDistance =
        currentSegment.distance - currentDistanceInSegment

      if (remainingMoveDistance >= remainingSegmentDistance) {
        remainingMoveDistance -= remainingSegmentDistance
        currentTravelledDistance += remainingSegmentDistance
        currentSegmentIndex += 1
        currentDistanceInSegment = 0
      } else {
        currentDistanceInSegment += remainingMoveDistance
        currentTravelledDistance += remainingMoveDistance
        remainingMoveDistance = 0
      }
    }

    segmentIndexRef.current = currentSegmentIndex
    distanceInSegmentRef.current = currentDistanceInSegment
    travelledDistanceRef.current = currentTravelledDistance

    setTravelledDistance(currentTravelledDistance)

    const progress =
      totalDistance > 0
        ? Math.min((currentTravelledDistance / totalDistance) * 100, 100)
        : 0

    setSimulationProgress(progress)

    if (currentSegmentIndex >= routeSegmentsRef.current.length) {
      const lastCoordinate = routeCoordinates[routeCoordinates.length - 1]
      const [lastLat, lastLon] = lastCoordinate

      setDronePosition({ lat: lastLat, lng: lastLon })
      landingStartAltitudeRef.current = droneAltitudeRef.current
      landingElapsedRef.current = 0
      setMissionStateValue('landing')
      return
    }

    const currentSegment = routeSegmentsRef.current[currentSegmentIndex]
    const segmentRatio =
      currentSegment.distance > 0
        ? currentDistanceInSegment / currentSegment.distance
        : 1

    const interpolatedPosition = interpolatePosition(
      currentSegment.start,
      currentSegment.end,
      segmentRatio
    )

    const leafletPosition = {
      lat: interpolatedPosition.lat,
      lng: interpolatedPosition.lon,
    }

    setDronePosition(leafletPosition)

    const requiredAltitude = calculateRequiredAltitude(
      interpolatedPosition,
      allObstacles
    )

    const nextAltitude = moveAltitudeSmoothly(
      droneAltitudeRef.current,
      requiredAltitude
    )

    setDroneAltitudeValue(nextAltitude)

    setEstimatedTimeRemaining(
      Math.max(
        0,
        (totalDistance - currentTravelledDistance) / DRONE_SPEED_MPS +
          LANDING_DURATION_MS / 1000
      )
    )
  }

  function startSimulationTimer() {
    stopSimulationTimer()
    intervalRef.current = setInterval(
      updateSimulationStep,
      SIMULATION_STEP_MS
    )
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
      const coordinates = data.route_coordinates || []
      const { segments, totalDistance: routeDistance } =
        createRouteSegments(coordinates)

      routeSegmentsRef.current = segments
      setRouteCoordinates(coordinates)
      setTotalDistance(routeDistance)
      setEstimatedTimeRemaining(
        routeDistance / DRONE_SPEED_MPS +
          TAKEOFF_DURATION_MS / 1000 +
          LANDING_DURATION_MS / 1000
      )
    } catch (err) {
      setError('Could not generate route. Check backend connection.')
    } finally {
      setLoading(false)
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
      resetSimulationState()
    } catch (err) {
      setObstaclesError('Obstacle loading failed. Keeping previous obstacles.')
    } finally {
      setObstaclesLoading(false)
    }
  }

  function handleStartSimulation() {
    if (!routeCoordinates || routeCoordinates.length < 2) {
      setError('Generate a route before starting simulation.')
      return
    }

    const { segments, totalDistance: routeDistance } =
      createRouteSegments(routeCoordinates)

    if (segments.length === 0) {
      setError('Route is too short for simulation.')
      return
    }

    routeSegmentsRef.current = segments
    segmentIndexRef.current = 0
    distanceInSegmentRef.current = 0
    travelledDistanceRef.current = 0
    takeoffElapsedRef.current = 0
    landingElapsedRef.current = 0
    landingStartAltitudeRef.current = 0

    const [startLat, startLon] = routeCoordinates[0]

    setError('')
    setTotalDistance(routeDistance)
    setTravelledDistance(0)
    setSimulationProgress(0)
    setDronePosition({ lat: startLat, lng: startLon })
    setDroneAltitudeValue(0)
    setEstimatedTimeRemaining(
      routeDistance / DRONE_SPEED_MPS +
        TAKEOFF_DURATION_MS / 1000 +
        LANDING_DURATION_MS / 1000
    )
    setMissionStateValue('taking_off')
    startSimulationTimer()
  }

  function handlePauseSimulation() {
    if (
      missionStateRef.current !== 'taking_off' &&
      missionStateRef.current !== 'flying' &&
      missionStateRef.current !== 'landing'
    ) {
      return
    }

    stopSimulationTimer()
    setMissionStateValue('paused')
  }

  function handleResumeSimulation() {
    if (missionStateRef.current !== 'paused') {
      return
    }

    setMissionStateValue('flying')
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
    setTotalDistance(0)
    resetSimulationState()
  }

  useEffect(() => {
    return () => {
      stopSimulationTimer()
    }
  }, [])

  const canStartSimulation =
    routeCoordinates.length > 1 &&
    (missionState === 'idle' || missionState === 'completed')

  const canPauseSimulation =
    missionState === 'taking_off' ||
    missionState === 'flying' ||
    missionState === 'landing'

  const canResumeSimulation = missionState === 'paused'

  return (
    <div className="map-page">
      <h1>Drone Route Planner</h1>
      <p>Click once for start, click again for goal, then generate route.</p>

      <div className="controls">
        <button
          onClick={handleLoadObstacles}
          disabled={
            loading ||
            isDrawingObstacle ||
            missionState === 'taking_off' ||
            missionState === 'flying' ||
            missionState === 'landing'
          }
        >
          {obstaclesLoading ? 'Loading Obstacles...' : 'Load Obstacles'}
        </button>

        <button
          onClick={handleGenerateRoute}
          disabled={
            loading ||
            missionState === 'taking_off' ||
            missionState === 'flying' ||
            missionState === 'landing'
          }
        >
          {loading ? 'Generating...' : 'Generate Route'}
        </button>

        <button
          onClick={handleReset}
          disabled={
            loading ||
            missionState === 'taking_off' ||
            missionState === 'flying' ||
            missionState === 'landing'
          }
        >
          Reset
        </button>

        <button
          onClick={() => {
            setIsDrawingObstacle((previousValue) => !previousValue)
            setPendingObstacleCorner(null)
          }}
          disabled={
            loading ||
            missionState === 'taking_off' ||
            missionState === 'flying' ||
            missionState === 'landing'
          }
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
          disabled={
            loading ||
            missionState === 'taking_off' ||
            missionState === 'flying' ||
            missionState === 'landing'
          }
        >
          Clear Manual Obstacles
        </button>
      </div>

      <div className="simulation-controls">
        {canStartSimulation && (
          <button
            onClick={handleStartSimulation}
            disabled={isDrawingObstacle}
          >
            Start Simulation
          </button>
        )}

        {canPauseSimulation && (
          <button onClick={handlePauseSimulation}>Pause</button>
        )}

        {canResumeSimulation && (
          <button onClick={handleResumeSimulation}>Resume</button>
        )}

        {(missionState !== 'idle' || dronePosition) && (
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
          <strong>Mission State:</strong> {missionState}
        </p>

        <p>
          <strong>Speed:</strong> {DRONE_SPEED_MPS} m/s
        </p>

        <p>
          <strong>Route Distance:</strong> {totalDistance.toFixed(1)} m
        </p>

        <p>
          <strong>Travelled:</strong> {travelledDistance.toFixed(1)} m
        </p>

        <p>
          <strong>Remaining Time:</strong>{' '}
          {formatTime(estimatedTimeRemaining)}
        </p>

        <p>
          <strong>Simulation Progress:</strong>{' '}
          {simulationProgress.toFixed(1)}%
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

        <p>
          <strong>Mode:</strong>{' '}
          {isDrawingObstacle
            ? pendingObstacleCorner
              ? 'Select second corner'
              : 'Select first corner'
            : missionState === 'idle'
              ? 'Route selection'
              : missionState}
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
        droneAltitude={droneAltitude}
      />
    </div>
  )
}

export default MapPage