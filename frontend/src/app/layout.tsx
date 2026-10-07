import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import 'leaflet/dist/leaflet.css'
import '../index.css'

export const metadata: Metadata = {
  title: 'Drone Mission Platform',
  description: 'Multi-drone route planning and simulation',
}

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}