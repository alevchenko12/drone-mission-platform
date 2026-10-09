import { useState } from 'react'

import { getMission, listMissions } from '../services/missionApi'
import type {
  MissionDetail,
  MissionSummary,
} from '../types/mission'

interface SavedMissionsPanelProps {
  onOpenMission: (mission: MissionDetail) => void
  disabled: boolean
}

function SavedMissionsPanel({
  onOpenMission,
  disabled,
}: SavedMissionsPanelProps) {
  const [missions, setMissions] = useState<MissionSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState('')

  async function handleLoadMissions() {
    if (loading) return

    try {
      setLoading(true)
      setError('')

      const result = await listMissions()

      setMissions(result)
      setHasLoaded(true)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load saved missions.',
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleOpenMission(missionId: string) {
    if (disabled || openingId !== null) return

    try {
      setOpeningId(missionId)
      setError('')

      const mission = await getMission(missionId)

      onOpenMission(mission)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not open the mission.',
      )
    } finally {
      setOpeningId(null)
    }
  }

  return (
    <section className="panel">
      <h2>Saved Missions</h2>

      <button
        className="mission-button"
        onClick={handleLoadMissions}
        disabled={loading}
      >
        {loading ? 'Loading...' : 'Refresh Saved Missions'}
      </button>

      <p>Opening a saved plan replaces the current map plan.</p>

      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}

      {!hasLoaded && (
        <p>Refresh to load saved mission plans.</p>
      )}

      {hasLoaded && missions.length === 0 && (
        <p>No saved missions found.</p>
      )}

      {missions.length > 0 && (
        <>
          <p>Showing up to 20 of the most recent missions.</p>

          <ul>
            {missions.map((mission) => (
              <li key={mission.id}>
                <strong>{mission.name}</strong>
                {' — '}
                {new Date(mission.created_at).toLocaleString()}
                {' '}
                <button
                  className="mission-button"
                  onClick={() => handleOpenMission(mission.id)}
                  disabled={disabled || openingId !== null}
                >
                  {openingId === mission.id ? 'Opening...' : 'Open'}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

export default SavedMissionsPanel