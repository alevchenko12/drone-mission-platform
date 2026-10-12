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
import type { CurrentUser } from '../types/auth'

const DRONE_HEIGHT = 14
const SAFETY_MARGIN = 5
const DRONE_SPEED_MPS = 8
const UPDATE_INTERVAL_MS = 200

function MapPage({ user }: { user: CurrentUser }) {
  // UI permissions guide the user; the backend independently enforces them.
  const canEditPlan = user.role === 'admin' || user.role === 'operator'

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
    if (!canEditPlan || loading || obstaclesLoading || savingMission) return
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
    if (!canEditPlan) return
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
  if (!canEditPlan) return
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
    canEditPlan &&
    planningInputs !== null &&
    assignments.length > 0 &&
    missionName.trim().length > 0 &&
    !loading &&
    !obstaclesLoading &&
    !savingMission

  const simulationActive = missionState === 'running' || missionState === 'paused'
  const plannerBusy = loading || obstaclesLoading || savingMission
  const controlsLocked = plannerBusy || simulationActive

  return (
    <main className="map-page">
      <header className="page-header">
        <div>
          <h1>Drone Mission Platform</h1>
          <p>Plan routes, explore saved missions and simulate flights.</p>
        </div>
        <span className="status-badge">{missionState}</span>
      </header>

      {/* The map occupies at least two-thirds of the desktop workspace. */}
      <div className="planner-workspace">
        <section className="map-panel" aria-label="Mission map">
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
        </section>

        <aside className="planner-sidebar" aria-label="Mission controls">
          <section className="panel">
            <h2>{canEditPlan ? 'Plan a mission' : 'View a mission'}</h2>
            {!canEditPlan && <p className="muted">Viewer access: open saved plans and explore their simulations.</p>}
            {canEditPlan && (
              <>
                <div className="mission-button-grid">
                  <button
                    className={`mission-button ${placementMode === 'drone' ? 'mission-button-primary' : ''}`}
                    aria-pressed={placementMode === 'drone'}
                    disabled={controlsLocked}
                    onClick={() => {
                      setPlacementMode(placementMode === 'drone' ? null : 'drone')
                      setIsDrawingObstacle(false)
                      setPendingObstacleCorner(null)
                    }}
                  >Add drone</button>
                  <button
                    className={`mission-button ${placementMode === 'goal' ? 'mission-button-primary' : ''}`}
                    aria-pressed={placementMode === 'goal'}
                    disabled={controlsLocked}
                    onClick={() => {
                      setPlacementMode(placementMode === 'goal' ? null : 'goal')
                      setIsDrawingObstacle(false)
                      setPendingObstacleCorner(null)
                    }}
                  >Add goal</button>
                  <button
                    className={`mission-button ${isDrawingObstacle ? 'mission-button-primary' : ''}`}
                    aria-pressed={isDrawingObstacle}
                    disabled={controlsLocked}
                    onClick={() => {
                      setIsDrawingObstacle((previous) => !previous)
                      setPendingObstacleCorner(null)
                      setPlacementMode(null)
                    }}
                  >{isDrawingObstacle ? 'Cancel drawing' : 'Draw obstacle'}</button>
                  <button
                    className="mission-button"
                    disabled={controlsLocked || isDrawingObstacle}
                    onClick={handleLoadObstacles}
                  >{obstaclesLoading ? 'Loading...' : 'Load obstacles'}</button>
                </div>
                {(placementMode || isDrawingObstacle) && (
                  <p className="muted" role="status">
                    {isDrawingObstacle
                      ? pendingObstacleCorner ? 'Click the opposite corner.' : 'Click the first obstacle corner.'
                      : `Click the map to place a ${placementMode}.`}
                  </p>
                )}
                {isDrawingObstacle && (
                  <label className="field-label">
                    Obstacle height (m)
                    <input type="number" min="0" value={manualObstacleHeight}
                      onChange={(event) => setManualObstacleHeight(event.target.value)}
                      disabled={controlsLocked} />
                  </label>
                )}
                <button
                  className="mission-button mission-button-primary full-width"
                  onClick={generateMultiRoute}
                  disabled={controlsLocked || isDrawingObstacle || dronePoints.length === 0 || dronePoints.length !== goalPoints.length}
                >{loading ? 'Generating...' : 'Generate routes'}</button>
                <details className="secondary-controls">
                  <summary>Clear and reset</summary>
                  <div className="mission-button-grid">
                    <button className="mission-button" onClick={() => {
                      setManualObstacles([])
                      setPendingObstacleCorner(null)
                      clearRoutes()
                    }} disabled={controlsLocked || manualObstacles.length === 0}>Clear manual</button>
                    <button className="mission-button" onClick={handleClearPoints} disabled={controlsLocked}>Clear points</button>
                    <button className="mission-button mission-button-danger" onClick={handleFullReset} disabled={controlsLocked}>Full reset</button>
                  </div>
                </details>
              </>
            )}
            {error && <p className="error-message" role="alert">{error}</p>}
            {obstaclesError && <p className="error-message" role="alert">{obstaclesError}</p>}
          </section>

          <section className="panel">
            <h2>Simulation</h2>
            <div className="mission-button-grid">
              <button className="mission-button" onClick={handleStartMission} disabled={plannerBusy || !canStartMission}>Start</button>
              {canPauseMission && <button className="mission-button" onClick={handlePauseMission}>Pause</button>}
              {canResumeMission && <button className="mission-button" onClick={handleResumeMission}>Resume</button>}
              {canLandMission && <button className="mission-button mission-button-danger" onClick={handleLandMission}>Land</button>}
              {canReturnHome && <button className="mission-button" onClick={handleReturnHome} disabled={plannerBusy}>Return home</button>}
            </div>
            <p className="muted">Local simulation of the displayed plan.</p>
            {droneSimStates.length > 0 && (
              <>
                <button className="mission-button" onClick={() => setShowProgress((previous) => !previous)} aria-expanded={showProgress}>
                  {showProgress ? 'Hide progress' : 'Show progress'}
                </button>
                {showProgress && <ul className="progress-list">
                  {droneSimStates.map((drone) => {
                    const remaining = Math.max(0, drone.totalDistance - drone.distanceTraveled)
                    const progress = drone.totalDistance > 0
                      ? Math.min(100, (drone.distanceTraveled / drone.totalDistance) * 100) : 0
                    return <li key={drone.id}>
                      <strong>Drone {drone.id + 1}</strong> · {drone.state}
                      <progress max={100} value={progress} aria-label={`Drone ${drone.id + 1} progress`} />
                      <span>{progress.toFixed(1)}% · {formatDistance(remaining)} remaining · {drone.altitude.toFixed(1)} m altitude</span>
                    </li>
                  })}
                </ul>}
              </>
            )}
          </section>

          <details className="panel mission-details" open>
            <summary>Mission details</summary>
            <dl className="mission-stats">
              <div><dt>Drones / goals</dt><dd>{dronePoints.length} / {goalPoints.length}</dd></div>
              <div><dt>OSM / manual obstacles</dt><dd>{obstacles.length} / {manualObstacles.length}</dd></div>
              <div><dt>Flight height</dt><dd>{droneHeight} m</dd></div>
              <div><dt>Safety margin</dt><dd>{safetyMargin} m</dd></div>
              <div><dt>Map zoom</dt><dd>{currentZoom}</dd></div>
            </dl>
            {assignments.length === 0 ? <p className="muted">No routes loaded.</p> : (
              <ul className="assignment-list">{assignments.map((assignment) => (
                <li key={`${assignment.drone_index}-${assignment.goal_index}`}>
                  Drone {assignment.drone_index + 1} → Goal {assignment.goal_index + 1}
                </li>
              ))}</ul>
            )}
          </details>
        </aside>
      </div>

      {/* Save and reopen are adjacent, rather than pushing the map downward. */}
      <div className="mission-library-grid">
        <section className="panel">
          <h2>Save mission plan</h2>
          {canEditPlan ? (
            <>
              <label className="field-label" htmlFor="mission-name">Mission name</label>
              <div className="save-form-row">
                <input id="mission-name" type="text" maxLength={120} value={missionName}
                  placeholder="For example: Budapest inspection" disabled={savingMission}
                  onChange={(event) => {
                    setMissionName(event.target.value)
                    setSaveError('')
                    setSaveMessage('')
                  }} />
                <button className="mission-button mission-button-primary" onClick={handleSaveMission} disabled={!canSaveMission}>
                  {savingMission ? 'Saving...' : 'Save plan'}
                </button>
              </div>
              <p className="muted">Saves routes and planning inputs. Each save creates a new plan.</p>
              {saveError && <p className="error-message" role="alert">{saveError}</p>}
              {saveMessage && <p className="success-message" role="status">{saveMessage}</p>}
            </>
          ) : <p className="muted">Your viewer role can open saved missions. Operators and admins can save new plans.</p>}
        </section>
        <SavedMissionsPanel onOpenMission={handleOpenMission} disabled={controlsLocked} />
      </div>
    </main>
  )
}

function AuthenticatedMapPage() {
  return (
    <AuthGate>
      {(user) => <MapPage user={user} />}
    </AuthGate>
  )
}

export default AuthenticatedMapPage
