'use client'

import dynamic from 'next/dynamic'

const MapPage = dynamic(() => import('../screens/MapPage'), {
  ssr: false,
  loading: () => <p>Loading planner...</p>,
})

export default function PlannerClient() {
  return <MapPage />
}