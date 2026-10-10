import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import type { LatLng } from 'leaflet'

import MapView from '../components/MapView'
import { generateMultiRoutes } from '../services/routeApi'
import { fetchObstacles } from '../services/obstacleApi'
import { createRectangleObstacle } from '../utils/manualObstacle'
import { calculateRouteLength, formatDistance } from '../utils/geo'
import {
  normalizeObstacle,
  restoreObstacle,
} from '../utils/routeObstacle'
import {
  createSimulationStates,
  advanceDrone,
} from '../utils/simulation'

import type { GeoPoint, MapBounds, Obstacle } from '../types/obstacle'
import type {
  MultiRouteItem,
  MultiRouteGenerateRequest,
} from '../types/route'
import type {
  MissionState,
  DroneSimulationState,
} from '../types/simulation'

import { saveMission } from '../services/missionApi'
import SavedMissionsPanel from '../components/SavedMissionsPanel'
import type { MissionDetail } from '../types/mission'

import AuthGate from '../components/AuthGate'

const DRONE_HEIGHT = 14
const SAFETY_MARGIN = 5
const DRONE_SPEED_MPS = 8
const UPDATE_INTERVAL_MS = 200

function MapPage() {
  const [dronePoints, setDronePoints] = useState<GeoPoint[]>([])
  const [goalPoints, setGoalPoints] = useState<GeoPoint[]>([])
  const [multiRoutes, setMultiRoutes] = useState<MultiRouteItem[]>([])
  const [assignments, setAssignments] = useState<MultiRouteItem[]>([])
  const [missionName, setMissionName] = useState('')
  const [savingMission, setSavingMission] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [droneHeight, setDroneHeight] = useState(DRONE_HEIGHT)
  const [safetyMargin, setSafetyMargin] = useState(SAFETY_MARGIN)

  // The exact request used to generate the current routes.
  const [planningInputs, setPlanningInputs] =
    useState<MultiRouteGenerateRequest | null>(null)

  const [placementMode, setPlacementMode] =
    useState<'drone' | 'goal' | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [obstacles, setObstacles] = useState<Obstacle[]>([])
  const [obstaclesLoading, setObstaclesLoading] = useState(false)
  const [obstaclesError, setObstaclesError] = useState('')

  const [manualObstacles, setManualObstacles] = useState<Obstacle[]>([])
  const [isDrawingObstacle, setIsDrawingObstacle] = useState(false)
  const [pendingObstacleCorner, setPendingObstacleCorner] =
    useState<LatLng | null>(null)
  const [manualObstacleHeight, setManualObstacleHeight] =
    useState<number | string>(0)

  const [currentBounds, setCurrentBounds] =
    useState<MapBounds | null>(null)
  const [currentZoom, setCurrentZoom] = useState(13)

  const [missionState, setMissionState] =
    useState<MissionState>('idle')
  const [droneSimStates, setDroneSimStates] =
    useState<DroneSimulationState[]>([])
  const [showProgress, setShowProgress] = useState(false)

  const simulationRef =
    useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const allFinished =
      droneSimStates.length > 0 &&
      droneSimStates.every(
        (drone) => drone.state === 'completed' || drone.state === 'landed',
      )

    if (missionState === 'running' && allFinished) {
      if (simulationRef.current !== null) {
        clearInterval(simulationRef.current)
        simulationRef.current = null
      }

      setMissionState('completed')
    }
  }, [droneSimStates, missionState])

  useEffect(() => {
    return () => {
      if (simulationRef.current !== null) {
        clearInterval(simulationRef.current)
        simulationRef.current = null
      }
    }
  }, [])

  const allObstacles = [...obstacles, ...manualObstacles]

  function stopSimulation() {
    if (simulationRef.current !== null) {
      clearInterval(simulationRef.current)
      simulationRef.current = null
    }
  }

  function clearRoutes() {
    stopSimulation()
    setMultiRoutes([])
    setAssignments([])
    setPlanningInputs(null)
    setDroneSimStates([])
    setMissionState('idle')
    setSaveError('')
    setSaveMessage('')
  }

  function handleMapClick(latlng: LatLng) {
    if (loading || obstaclesLoading || savingMission) return
    if (missionState === 'running' || missionState === 'paused') return
    if (!isDrawingObstacle && placementMode === null) return

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
        Number(manualObstacleHeight) || 0,
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
        'Map bounds are not ready yet. Move or zoom the map and try again.',
      )
      return
    }

    try {
      setObstaclesLoading(true)
      setObstaclesError('')

      const response = await fetchObstacles(currentBounds)

      if (response.source_status === 'rate_limited') {
        setObstaclesError(
          'Obstacle service is temporarily rate-limited. Keeping previous obstacles.',
        )
        return
      }

      if (response.source_status === 'timeout') {
        setObstaclesError(
          'Obstacle service timed out. Keeping previous obstacles.',
        )
        return
      }

      if (response.source_status === 'error') {
        setObstaclesError(
          'Obstacle loading failed. Keeping previous obstacles.',
        )
        return
      }

      setObstacles(response.obstacles || [])
      clearRoutes()
    } catch (err) {
      console.error(err)
      setObstaclesError(
        'Obstacle loading failed. Check backend /obstacles route.',
      )
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

      const body: MultiRouteGenerateRequest = {
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
          height: droneHeight,
          safety_margin: safetyMargin,
        },
      }

      const response = await generateMultiRoutes(body)
      const routeAssignments = response.assignments || []

      // Store inputs together with the routes generated from them.
      setPlanningInputs(body)
      setMultiRoutes(routeAssignments)
      setAssignments(routeAssignments)
      setDroneSimStates([])
      setMissionState('idle')
    } catch (err) {
      console.error(err)

      let message = 'Failed to generate routes.'

      if (axios.isAxiosError<{ detail?: unknown }>(err)) {
        const detail = err.response?.data?.detail

        if (typeof detail === 'string') {
          message = detail
        } else if (detail != null) {
          message = JSON.stringify(detail) ?? message
        } else {
          message = err.message || message
        }
      } else if (err instanceof Error) {
        message = err.message
      }

      setError(message)
    } finally {
      setLoading(false)
    }
  }

  function updateSimulationStep() {
    setDroneSimStates((previousStates) =>
      previousStates.map((drone) =>
        advanceDrone(
          drone,
          DRONE_SPEED_MPS,
          UPDATE_INTERVAL_MS,
          droneHeight,
        ),
      ),
    )
  }

  function handleOpenMission(mission: MissionDetail) {
  // Check current activity again after the fetch finishes.
  if (
    loading ||
    obstaclesLoading ||
    savingMission ||
    missionState === 'running' ||
    missionState === 'paused'
  ) {
    throw new Error('Finish the current operation before opening a mission.')
  }

  const inputs = mission.planning_inputs

  // Convert everything before changing the current map.
  const restoredObstacles = inputs.obstacles.map(restoreObstacle)

  const restoredRoutes: MultiRouteItem[] = mission.routes.map((route) => ({
    drone_index: route.drone_index,
    goal_index: route.goal_index,
    route_coordinates: route.route_coordinates,
    distance: route.distance,
  }))

  stopSimulation()

  setDronePoints(inputs.start_points)
  setGoalPoints(inputs.goal_points)
  setObstacles(
    restoredObstacles.filter((obstacle) => obstacle.source === 'osm'),
  )
  setManualObstacles(
    restoredObstacles.filter((obstacle) => obstacle.source === 'manual'),
  )

  setDroneHeight(inputs.drone_parameters.height)
  setSafetyMargin(inputs.drone_parameters.safety_margin)
  setPlanningInputs(inputs)
  setMultiRoutes(restoredRoutes)
  setAssignments(restoredRoutes)

  setDroneSimStates([])
  setMissionState('idle')
  setShowProgress(false)
  setPlacementMode(null)
  setIsDrawingObstacle(false)
  setPendingObstacleCorner(null)

  setMissionName(mission.name)
  setError('')
  setObstaclesError('')
  setSaveError('')
  setSaveMessage('')
}

  async function handleSaveMission() {
  const name = missionName.trim()

  setSaveError('')
  setSaveMessage('')

  if (!name) {
    setSaveError('Please enter a mission name.')
    return
  }

  if (!planningInputs || assignments.length === 0) {
    setSaveError('Generate routes before saving a mission.')
    return
  }

  if (savingMission || loading || obstaclesLoading) {
    return
  }

  try {
    setSavingMission(true)

    const savedMission = await saveMission({
      name,
      planning_inputs: planningInputs,
      assignments,
    })

    setSaveMessage(`Saved "${savedMission.name}".`)
  } catch (err) {
    setSaveError(
      err instanceof Error
        ? err.message
        : 'Could not save the mission.',
    )
  } finally {
    setSavingMission(false)
  }
}

  function handleStartMission() {
    if (assignments.length === 0) {
      setError('Generate routes before starting mission.')
      return
    }

    try {
      const initialStates = createSimulationStates(assignments)

      stopSimulation()
      setError('')
      setDroneSimStates(initialStates)
      setMissionState('running')

      simulationRef.current = setInterval(
        updateSimulationStep,
        UPDATE_INTERVAL_MS,
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not start the simulation.',
      )
    }
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
      UPDATE_INTERVAL_MS,
    )
  }

  function handleLandMission() {
    if (missionState !== 'running' && missionState !== 'paused') return

    stopSimulation()

    setDroneSimStates((previous) =>
      previous.map(
        (drone): DroneSimulationState => ({
          ...drone,
          altitude: 0,
          state: 'landed',
        }),
      ),
    )

    setMissionState('landed')
  }

  function handleReturnHome() {
    if (droneSimStates.length === 0) {
      setError('Start or complete a mission before return home.')
      return
    }

    stopSimulation()

    const returnStates = droneSimStates.map(
      (drone): DroneSimulationState => {
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
      },
    )

    setDroneSimStates(returnStates)
    setMissionState('running')

    simulationRef.current = setInterval(
      updateSimulationStep,
      UPDATE_INTERVAL_MS,
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
    setPlanningInputs(null)
    setDroneSimStates([])
    setObstacles([])
    setManualObstacles([])
    setPendingObstacleCorner(null)
    setIsDrawingObstacle(false)
    setPlacementMode(null)
    setMissionState('idle')
    setError('')
    setObstaclesError('')
    setSaveError('')
    setSaveMessage('')
    setMissionName('')
    setDroneHeight(DRONE_HEIGHT)
    setSafetyMargin(SAFETY_MARGIN)
  }

  const canStartMission =
    assignments.length > 0 &&
    (missionState === 'idle' ||
      missionState === 'completed' ||
      missionState === 'landed')

  const canPauseMission = missionState === 'running'
  const canResumeMission = missionState === 'paused'

  const canLandMission =
    missionState === 'running' || missionState === 'paused'

  const canReturnHome =
    droneSimStates.length > 0 &&
    (missionState === 'completed' || missionState === 'landed')

  const canSaveMission =
    planningInputs !== null &&
    assignments.length > 0 &&
    missionName.trim().length > 0 &&
    !loading &&
    !obstaclesLoading &&
    !savingMission

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

      <section className="panel">
  <h2>Save Mission Plan</h2>

  <label>
    Mission name:
    <input
      type="text"
      maxLength={120}
      value={missionName}
      onChange={(event) => {
        setMissionName(event.target.value)
        setSaveError('')
        setSaveMessage('')
      }}
      placeholder="For example: Budapest inspection"
      disabled={savingMission}
    />
  </label>

  <button
    className="mission-button mission-button-primary"
    onClick={handleSaveMission}
    disabled={!canSaveMission}
  >
    {savingMission ? 'Saving...' : 'Save Mission'}
  </button>

  {saveError && (
    <p className="error-message" role="alert">
      {saveError}
    </p>
  )}

  {saveMessage && (
    <p role="status">{saveMessage}</p>
  )}
</section>

      <SavedMissionsPanel
  onOpenMission={handleOpenMission}
  disabled={
    loading ||
    obstaclesLoading ||
    savingMission ||
    missionState === 'running' ||
    missionState === 'paused'
  }
/>

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
              <strong>Drone Height:</strong> {droneHeight} m
            </p>
            <p>
              <strong>Safety Margin:</strong> {safetyMargin} m
            </p>
            <p>
              <strong>Zoom:</strong> {currentZoom}
            </p>
            <p>
              <strong>Plan ready to save:</strong>{' '}
              {canSaveMission ? 'Yes' : 'No'}
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
                  drone.totalDistance - drone.distanceTraveled,
                )

                const progress =
                  drone.totalDistance > 0
                    ? Math.min(
                        100,
                        (drone.distanceTraveled / drone.totalDistance) * 100,
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

function AuthenticatedMapPage() {
  return (
    <AuthGate>
      <MapPage />
    </AuthGate>
  )
}

export default AuthenticatedMapPage