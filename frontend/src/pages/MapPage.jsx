import { useState } from 'react'
import MapView from '../components/MapView'
import { generateRoute } from '../services/routeApi'

function MapPage() {
  const [startPoint, setStartPoint] = useState(null)
  const [goalPoint, setGoalPoint] = useState(null)
  const [routeCoordinates, setRouteCoordinates] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [obstacles, setObstacles] = useState([])
  const [obstaclesLoading, setObstaclesLoading] = useState(false)
  const [obstaclesError, setObstaclesError] = useState('')

  function handleMapClick(latlng) {
    setError('')
    setRouteCoordinates([])

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

      const data = await generateRoute(startPoint, goalPoint)
      setRouteCoordinates(data.route_coordinates)
    } catch (err) {
      setError('Could not generate route. Check backend connection.')
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setStartPoint(null)
    setGoalPoint(null)
    setRouteCoordinates([])
    setError('')
    setObstacles([])
    setObstaclesError('')
  }

  return (
    <div className="map-page">
      <h1>Drone Route Planner</h1>
      <p>Click once for start, click again for goal, then generate route.</p>

      <div className="controls">
        <button onClick={handleGenerateRoute} disabled={loading}>
          {loading ? 'Generating...' : 'Generate Route'}
        </button>

        <button onClick={handleReset} disabled={loading}>
          Reset
        </button>
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
          <strong>Obstacles:</strong> {obstacles.length}
        </p>
      </div>

      <MapView
        startPoint={startPoint}
        goalPoint={goalPoint}
        routeCoordinates={routeCoordinates}
        onMapClick={handleMapClick}
        obstacles={obstacles}
        setObstacles={setObstacles}
        setObstaclesLoading={setObstaclesLoading}
        setObstaclesError={setObstaclesError}
      />
    </div>
  )
}

export default MapPage