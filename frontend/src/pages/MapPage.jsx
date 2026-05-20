import { useEffect, useRef, useState } from 'react'
import MapView from '../components/MapView'
import { generateRoute } from '../services/routeApi'
import { createRectangleObstacle } from '../utils/manualObstacle'
import { fetchObstacles } from '../services/obstacleApi'

const BASE_ALTITUDE = 18
const SAFETY_MARGIN = 5
const DRONE_SPEED_MPS = 5
const SIMULATION_STEP_MS = 200
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
  const [nearestObstacleInfo, setNearestObstacleInfo] = useState(null)

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
  const pausedMissionStateRef = useRef('idle')

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

    routeSegmentsRef.current = []
    segmentIndexRef.current = 0
    distanceInSegmentRef.current = 0
    travelledDistanceRef.current = 0
    takeoffElapsedRef.current = 0
    landingElapsedRef.current = 0
    landingStartAltitudeRef.current = 0
    pausedMissionStateRef.current = 'idle'
    missionStateRef.current = 'idle'
    droneAltitudeRef.current = 0

    setMissionState('idle')
    setDronePosition(null)
    setDroneAltitude(0)
    setSimulationProgress(0)
    setTravelledDistance(0)
    setEstimatedTimeRemaining(0)
    setNearestObstacleInfo(null)
  }

  function updateNearestObstacle(position) {
    let nearest = null
    let minDistance = Infinity

    for (const obstacle of allObstacles) {
      const center = getObstacleCenter(obstacle)

      if (!center) {
        continue
      }

      const distance = calculateDistanceMeters(
        { lat: position.lat, lon: position.lon },
        center
      )

      if (distance < minDistance) {
        minDistance = distance
        nearest = {
          id: obstacle.id,
          type: obstacle.type,
          height: obstacle.height || 0,
          distance,
          requiredAltitude: (obstacle.height || 0) + SAFETY_MARGIN,
        }
      }
    }

    setNearestObstacleInfo(nearest)
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

      const nextAltitude = landingStartAltitudeRef.current * (1 - ratio)

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

    if (
      currentMissionState !== 'flying' &&
      currentMissionState !== 'returning'
    ) {
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
      const lastSegment = routeSegmentsRef.current[routeSegmentsRef.current.length - 1]

      if (lastSegment) {
        setDronePosition({
          lat: lastSegment.end.lat,
          lng: lastSegment.end.lon,
        })
      }

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
    updateNearestObstacle(interpolatedPosition)

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
    setTotalDistance(0)
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
    pausedMissionStateRef.current = 'idle'

    const [startLat, startLon] = routeCoordinates[0]

    setError('')
    setTotalDistance(routeDistance)
    setTravelledDistance(0)
    setSimulationProgress(0)
    setDronePosition({ lat: startLat, lng: startLon })
    setDroneAltitudeValue(0)
    setNearestObstacleInfo(null)
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
      missionStateRef.current !== 'returning' &&
      missionStateRef.current !== 'landing'
    ) {
      return
    }

    pausedMissionStateRef.current = missionStateRef.current
    stopSimulationTimer()
    setMissionStateValue('paused')
  }

  function handleResumeSimulation() {
    if (missionStateRef.current !== 'paused') {
      return
    }

    const previousMissionState = pausedMissionStateRef.current || 'flying'

    setMissionStateValue(previousMissionState)
    startSimulationTimer()
  }

  function handleLandSimulation() {
    if (
      missionStateRef.current !== 'taking_off' &&
      missionStateRef.current !== 'flying' &&
      missionStateRef.current !== 'returning'
    ) {
      return
    }

    landingStartAltitudeRef.current = droneAltitudeRef.current
    landingElapsedRef.current = 0
    setMissionStateValue('landing')
    startSimulationTimer()
  }

  async function handleReturnHomeSimulation() {
    if (
      missionStateRef.current !== 'flying' &&
      missionStateRef.current !== 'returning'
    ) {
      return
    }

    if (!dronePosition || !startPoint) {
      return
    }

    try {
      setError('')

      const returnStart = {
        lat: dronePosition.lat,
        lng: dronePosition.lng,
      }

      const data = await generateRoute(returnStart, startPoint, allObstacles)
      const coordinates = data.route_coordinates || []

      if (coordinates.length < 2) {
        handleLandSimulation()
        return
      }

      const { segments, totalDistance: routeDistance } =
        createRouteSegments(coordinates)

      routeSegmentsRef.current = segments
      segmentIndexRef.current = 0
      distanceInSegmentRef.current = 0
      travelledDistanceRef.current = 0

      setRouteCoordinates(coordinates)
      setTotalDistance(routeDistance)
      setTravelledDistance(0)
      setSimulationProgress(0)
      setEstimatedTimeRemaining(
        routeDistance / DRONE_SPEED_MPS + LANDING_DURATION_MS / 1000
      )
      setMissionStateValue('returning')
      startSimulationTimer()
    } catch (err) {
      setError('Could not generate return-home route. Landing instead.')
      handleLandSimulation()
    }
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
    missionState === 'returning' ||
    missionState === 'landing'

  const canResumeSimulation = missionState === 'paused'

  const canLandSimulation =
    missionState === 'taking_off' ||
    missionState === 'flying' ||
    missionState === 'returning'

  const canReturnHomeSimulation =
    missionState === 'flying' || missionState === 'returning'

  const nearestObstacleText = nearestObstacleInfo
    ? `${nearestObstacleInfo.id || nearestObstacleInfo.type} (${nearestObstacleInfo.distance.toFixed(
        0
      )} m, height ${nearestObstacleInfo.height.toFixed(
        1
      )} m, required ${nearestObstacleInfo.requiredAltitude.toFixed(1)} m)`
    : 'None'

  return (
    <div className="map-page">
      <header className="page-header">
        <h1>Drone Route Planner</h1>
        <p>
          Select start and goal on the map, load obstacles, generate a route,
          then control the mission.
        </p>
      </header>

      <section className="panel mission-controls-panel">
        <h2>Mission Controls</h2>

        <div className="mission-button-grid">
          <button
            className="mission-button"
            onClick={handleLoadObstacles}
            disabled={
              loading ||
              isDrawingObstacle ||
              missionState === 'taking_off' ||
              missionState === 'flying' ||
              missionState === 'returning' ||
              missionState === 'landing'
            }
          >
            {obstaclesLoading ? 'Loading Obstacles...' : 'Load Obstacles'}
          </button>

          <button
            className="mission-button"
            onClick={handleGenerateRoute}
            disabled={
              loading ||
              missionState === 'taking_off' ||
              missionState === 'flying' ||
              missionState === 'returning' ||
              missionState === 'landing'
            }
          >
            {loading ? 'Generating...' : 'Generate Route'}
          </button>

          <button
            className="mission-button mission-button-primary"
            onClick={handleStartSimulation}
            disabled={!canStartSimulation || isDrawingObstacle}
          >
            Start
          </button>

          <button
            className="mission-button"
            onClick={handlePauseSimulation}
            disabled={!canPauseSimulation}
          >
            Pause
          </button>

          <button
            className="mission-button"
            onClick={handleResumeSimulation}
            disabled={!canResumeSimulation}
          >
            Resume
          </button>

          <button
            className="mission-button mission-button-danger"
            onClick={handleLandSimulation}
            disabled={!canLandSimulation}
          >
            Land
          </button>

          <button
            className="mission-button"
            onClick={handleReturnHomeSimulation}
            disabled={!canReturnHomeSimulation}
          >
            Return Home
          </button>

          <button
            className="mission-button"
            onClick={handleResetSimulation}
            disabled={missionState === 'idle' && !dronePosition}
          >
            Reset Mission
          </button>

          <button
            className="mission-button"
            onClick={handleReset}
            disabled={
              loading ||
              missionState === 'taking_off' ||
              missionState === 'flying' ||
              missionState === 'returning' ||
              missionState === 'landing'
            }
          >
            Full Reset
          </button>

          <button
            className="mission-button"
            onClick={() => {
              setIsDrawingObstacle((previousValue) => !previousValue)
              setPendingObstacleCorner(null)
            }}
            disabled={
              loading ||
              missionState === 'taking_off' ||
              missionState === 'flying' ||
              missionState === 'returning' ||
              missionState === 'landing'
            }
          >
            {isDrawingObstacle ? 'Cancel Drawing' : 'Draw Obstacle'}
          </button>

          <button
            className="mission-button"
            onClick={() => {
              setManualObstacles([])
              setPendingObstacleCorner(null)
              resetSimulationState()
            }}
            disabled={
              loading ||
              manualObstacles.length === 0 ||
              missionState === 'taking_off' ||
              missionState === 'flying' ||
              missionState === 'returning' ||
              missionState === 'landing'
            }
          >
            Clear Manual
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
              <strong>Speed:</strong> {DRONE_SPEED_MPS} m/s
            </p>

            <p>
              <strong>Progress:</strong> {simulationProgress.toFixed(1)}%
            </p>

            <p>
              <strong>Drone Altitude:</strong> {droneAltitude.toFixed(1)} m
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
              <strong>Drone Position:</strong>{' '}
              {dronePosition
                ? `${dronePosition.lat.toFixed(5)}, ${dronePosition.lng.toFixed(5)}`
                : 'Not active'}
            </p>
          </div>
        </div>

        <div className="panel route-panel">
          <h2>Route & Obstacles</h2>

          <div className="info-list">
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
              <strong>Nearest Obstacle:</strong> {nearestObstacleText}
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
        </div>
      </section>

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