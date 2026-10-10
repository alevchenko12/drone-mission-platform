'use client'

import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'

import { getCurrentUser, login, logout } from '../services/authApi'
import type { CurrentUser } from '../types/auth'

interface AuthGateProps {
  children: ReactNode
}

function AuthGate({ children }: AuthGateProps) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function checkSession() {
      try {
        const currentUser = await getCurrentUser()

        if (!cancelled) {
          setUser(currentUser)
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Could not check your session.',
          )
        }
      } finally {
        if (!cancelled) {
          setCheckingSession(false)
        }
      }
    }

    void checkSession()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError('')

    try {
      const currentUser = await login({
        email: email.trim(),
        password,
      })

      setPassword('')
      setUser(currentUser)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not log in.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleLogout() {
    if (busy) return

    setBusy(true)
    setError('')

    try {
      await logout()
      setUser(null)
      setPassword('')
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not log out.',
      )
    } finally {
      setBusy(false)
    }
  }

  if (checkingSession) {
    return <p role="status">Checking your session...</p>
  }

  if (!user) {
    return (
      <main className="map-page">
        <section className="panel">
          <h1>Drone Mission Platform</h1>
          <p>Log in to access your organization’s mission plans.</p>

          <form onSubmit={handleLogin}>
            <p>
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={busy}
              />
            </p>

            <p>
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                maxLength={1024}
                disabled={busy}
              />
            </p>

            <button
              className="mission-button mission-button-primary"
              type="submit"
              disabled={busy}
            >
              {busy ? 'Logging in...' : 'Log In'}
            </button>
          </form>

          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </section>
      </main>
    )
  }

  return (
    <>
      <section className="panel">
        <p>
          Signed in as <strong>{user.email}</strong>
          {' — '}Role: {user.role}
        </p>

        <button
          className="mission-button"
          onClick={handleLogout}
          disabled={busy}
        >
          {busy ? 'Logging out...' : 'Log Out'}
        </button>

        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </section>

      {children}
    </>
  )
}

export default AuthGate