// Thin REST wrapper around the QBO Accounting API.
//
// Phase A only needs a `getCompanyInfo()` smoke test so the settings card
// can confirm a freshly-completed OAuth handshake actually talks to QB.
// Phase B/C will layer entity-specific helpers on top of qboFetch().

import { getActiveAccessToken } from '@/lib/qbo/connection'
import { qboApiBase } from '@/lib/qbo/oauth'

export class QboApiError extends Error {
  status: number
  body: string
  constructor(status: number, body: string) {
    super(`QBO API ${status}: ${body.slice(0, 300)}`)
    this.name = 'QboApiError'
    this.status = status
    this.body = body
  }
}

export class QboNotConnectedError extends Error {
  constructor() {
    super('No active QuickBooks connection for this studio.')
    this.name = 'QboNotConnectedError'
  }
}

// Low-level fetch. Path is appended to `/v3/company/<realmId>/`.
export async function qboFetch(
  designerId: string,
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown; query?: Record<string, string> } = {},
): Promise<unknown> {
  const token = await getActiveAccessToken(designerId)
  if (!token) throw new QboNotConnectedError()

  const base = qboApiBase(token.environment)
  const url = new URL(`${base}/v3/company/${token.realmId}/${path}`)
  url.searchParams.set('minorversion', '70')
  if (init.query) {
    for (const [k, v] of Object.entries(init.query)) url.searchParams.set(k, v)
  }

  const res = await fetch(url.toString(), {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new QboApiError(res.status, body)
  }
  return res.json()
}

export interface QboCompanyInfo {
  companyName: string
  legalName: string | null
  country: string | null
  fiscalYearStartMonth: string | null
}

export async function getCompanyInfo(designerId: string): Promise<QboCompanyInfo> {
  const token = await getActiveAccessToken(designerId)
  if (!token) throw new QboNotConnectedError()
  const data = (await qboFetch(designerId, `companyinfo/${token.realmId}`)) as {
    CompanyInfo: {
      CompanyName: string
      LegalName?: string
      Country?: string
      FiscalYearStartMonth?: string
    }
  }
  const ci = data.CompanyInfo
  return {
    companyName: ci.CompanyName,
    legalName: ci.LegalName ?? null,
    country: ci.Country ?? null,
    fiscalYearStartMonth: ci.FiscalYearStartMonth ?? null,
  }
}
