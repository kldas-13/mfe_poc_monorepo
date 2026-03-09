/**
 * services.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Defines every service the meta-bff knows about and provides a single
 * function — buildSnapshot() — that probes them all and returns a
 * DashboardSnapshot ready to broadcast.
 *
 * HOW PROBING WORKS
 * ─────────────────
 * Each service exposes GET /api/health  →  { status: 'ok' }
 * We fetch that endpoint with a 1.5 s timeout.
 *   • 2xx response  → healthy, real latency recorded
 *   • Non-2xx / timeout / network error → down, latency 9999
 *
 * If a service is down we fall back to a plausible mock so the dashboard
 * always has something to display during development when not every repo
 * is running.
 *
 * ADDING A NEW SERVICE
 * ────────────────────
 * Just push a new entry onto REGISTRY. Nothing else changes.
 */

// ─── Types (shared with index.ts and the shell) ───────────────────────────────

export type ServiceStatus = 'healthy' | 'degraded' | 'down'

export interface ServiceRecord {
  id:             string         // machine-readable, stable
  name:           string         // human-readable display name
  port:           number         // port it runs on
  url:            string         // base URL used for probing
  role:           string         // short description of the service's role
  status:         ServiceStatus
  latencyMs:      number         // actual round-trip or 9999 if unreachable
  requestsPerMin: number         // simulated (replace with real metrics in prod)
  errorsPerMin:   number
  uptimeSecs:     number
  lastChecked:    string         // ISO timestamp
}

export interface DashboardSnapshot {
  services:         ServiceRecord[]
  systemHealth:     ServiceStatus  // worst-case of all services
  healthyCount:     number
  degradedCount:    number
  downCount:        number
  ts:               number         // Unix ms
}

// ─── Service registry ─────────────────────────────────────────────────────────

interface RegistryEntry {
  id:   string
  name: string
  port: number
  url:  string
  role: string
}

const REGISTRY: RegistryEntry[] = [
  {
    id:   'meta-bff',
    name: 'Meta BFF',
    port: 3000,
    url:  'http://localhost:3000',
    role: 'Aggregation BFF for the shell — this service',
  },
  {
    id:   'graph-bff',
    name: 'Graph Canvas BFF',
    port: 3001,
    url:  'http://localhost:3001',
    role: 'Serves graph topology data (nodes + edges)',
  },
  {
    id:   'bpmn-bff',
    name: 'BPMN Canvas BFF',
    port: 3002,
    url:  'http://localhost:3002',
    role: 'Serves BPMN workflow XML and step events',
  },
  {
    id:   'meta-shell',
    name: 'Meta Shell',
    port: 5173,
    url:  'http://localhost:5173',
    role: 'qiankun host shell — orchestrates the MFEs',
  },
  {
    id:   'graph-mfe',
    name: 'Graph Canvas MFE',
    port: 5174,
    url:  'http://localhost:5174',
    role: 'Graphology + Sigma.js MFE (qiankun remote)',
  },
  {
    id:   'bpmn-mfe',
    name: 'BPMN Canvas MFE',
    port: 5175,
    url:  'http://localhost:5175',
    role: 'bpmn-js canvas MFE (qiankun remote)',
  },
]

// ─── Health probe ─────────────────────────────────────────────────────────────

const SERVER_START = Date.now()

/**
 * Probe one service.
 * Returns { alive, latencyMs }.
 * Never throws — all errors map to { alive: false, latencyMs: 9999 }.
 */
async function probe(url: string): Promise<{ alive: boolean; latencyMs: number }> {
  const t0 = Date.now()
  try {
    const res = await fetch(`${url}/api/health`, {
      signal: AbortSignal.timeout(1500),
    })
    return { alive: res.ok, latencyMs: Date.now() - t0 }
  } catch {
    return { alive: false, latencyMs: 9999 }
  }
}

/**
 * Probe every registered service concurrently and assemble a snapshot.
 * This is the function the broadcaster calls every N seconds.
 */
export async function buildSnapshot(): Promise<DashboardSnapshot> {
  const results = await Promise.all(
    REGISTRY.map(async (svc): Promise<ServiceRecord> => {
      const { alive, latencyMs } = await probe(svc.url)

      // Simulate degraded state: real response but high latency
      const status: ServiceStatus = !alive
        ? 'down'
        : latencyMs > 800
        ? 'degraded'
        : 'healthy'

      return {
        ...svc,
        status,
        latencyMs,
        // In production replace these with real counters from Prometheus / your APM
        requestsPerMin: alive ? Math.floor(Math.random() * 400) + 20 : 0,
        errorsPerMin:   alive ? Math.floor(Math.random() * 3)        : 0,
        uptimeSecs:     Math.floor((Date.now() - SERVER_START) / 1000),
        lastChecked:    new Date().toISOString(),
      }
    })
  )

  const healthyCount  = results.filter((s) => s.status === 'healthy').length
  const degradedCount = results.filter((s) => s.status === 'degraded').length
  const downCount     = results.filter((s) => s.status === 'down').length

  const systemHealth: ServiceStatus =
    downCount     > 0 ? 'down'     :
    degradedCount > 0 ? 'degraded' : 'healthy'

  return {
    services: results,
    systemHealth,
    healthyCount,
    degradedCount,
    downCount,
    ts: Date.now(),
  }
}
