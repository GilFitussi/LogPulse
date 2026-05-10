import { useEffect, useState } from "react"

const AUTH_STATUS = {
  CHECKING: "checking",
  CONNECTED: "connected",
  NOT_LOGGED_IN: "not-logged-in",
  OC_NOT_INSTALLED: "oc-not-installed",
  ERROR: "error",
}

const authStatusContent = {
  [AUTH_STATUS.CHECKING]: {
    label: "Checking OpenShift authentication...",
    message: "Verifying whether the backend can access your local oc session.",
    className: "border-slate-200 bg-slate-50 text-slate-700",
  },
  [AUTH_STATUS.CONNECTED]: {
    label: "Connected",
    message: "Backend can access your local OpenShift session.",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  [AUTH_STATUS.NOT_LOGGED_IN]: {
    label: "Not logged in",
    message: "Please run oc login from your terminal.",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  [AUTH_STATUS.OC_NOT_INSTALLED]: {
    label: "oc not installed",
    message: "Install the OpenShift CLI and make sure oc is available in your PATH.",
    className: "border-red-200 bg-red-50 text-red-800",
  },
  [AUTH_STATUS.ERROR]: {
    label: "Unable to check authentication",
    message: "The backend could not verify your OpenShift authentication status.",
    className: "border-red-200 bg-red-50 text-red-800",
  },
}

function App() {
  const [healthStatus, setHealthStatus] = useState("Checking backend health...")
  const [authStatus, setAuthStatus] = useState(AUTH_STATUS.CHECKING)

  useEffect(() => {
    const checkBackendHealth = async () => {
      try {
        const response = await fetch("http://localhost:3000/health")

        if (!response.ok) {
          setHealthStatus("Backend health check failed")
          return
        }

        const data = await response.json()

        if (data.status === "ok") {
          setHealthStatus("Backend is healthy")
          return
        }

        setHealthStatus("Backend health check failed")
      } catch {
        setHealthStatus("Backend health check failed")
      }
    }

    const checkAuthStatus = async () => {
      try {
        const response = await fetch("http://localhost:3000/api/auth/status")
        const data = await response.json().catch(() => ({}))

        if (response.ok && data.authenticated === true) {
          setAuthStatus(AUTH_STATUS.CONNECTED)
          return
        }

        if (response.status === 401) {
          setAuthStatus(AUTH_STATUS.NOT_LOGGED_IN)
          return
        }

        if (response.status === 500 && data.error?.toLowerCase().includes("oc cli")) {
          setAuthStatus(AUTH_STATUS.OC_NOT_INSTALLED)
          return
        }

        setAuthStatus(AUTH_STATUS.ERROR)
      } catch {
        setAuthStatus(AUTH_STATUS.ERROR)
      }
    }

    checkBackendHealth()
    checkAuthStatus()
  }, [])

  const authContent = authStatusContent[authStatus]

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="border-b border-slate-200 pb-5">
          <h1 className="text-3xl font-semibold text-slate-950">OS-LogPulse</h1>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-base font-medium text-slate-900">Backend status</h2>
            <p className="mt-2 text-sm text-slate-700">{healthStatus}</p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-base font-medium text-slate-900">OpenShift authentication</h2>
            <div className={`mt-3 rounded-md border px-4 py-3 ${authContent.className}`}>
              <p className="text-sm font-medium">{authContent.label}</p>
              <p className="mt-1 text-sm">{authContent.message}</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-base font-medium text-slate-900">Project selector</h2>
            <div className="mt-4 h-11 rounded-md border border-dashed border-slate-300 bg-slate-50" />
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-base font-medium text-slate-900">Pod selector</h2>
            <div className="mt-4 h-11 rounded-md border border-dashed border-slate-300 bg-slate-50" />
          </div>
        </section>

        <section className="min-h-96 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-base font-medium text-slate-900">Log viewer area</h2>
          <div className="mt-4 h-72 rounded-md border border-dashed border-slate-300 bg-slate-950" />
        </section>
      </div>
    </main>
  )
}

export default App
