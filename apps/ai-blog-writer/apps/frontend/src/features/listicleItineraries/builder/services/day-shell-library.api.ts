import { API_BASE_URL } from '../../../../shared/api/client/config'
import { parseErrorResponse } from '../../../../shared/api/client/error-parser'
import type { DayShellSlot, DayShellTemplate } from '../../types'

/** Backend wire shape for one Shell Slot (snake_case mirror of `DayShellSlot`). */
type ApiShellSlot = {
  id: string
  label: string
  daypart: DayShellSlot['daypart']
  acceptable_collections: DayShellSlot['acceptableCollections']
  preferred_collections: DayShellSlot['preferredCollections']
  intent_tags: string[]
  avoid_tags: string[]
}

type ApiDayShell = {
  id: string
  name: string
  description: string
  slots: ApiShellSlot[]
}

function toApiSlot(slot: DayShellSlot): ApiShellSlot {
  return {
    id: slot.id,
    label: slot.label,
    daypart: slot.daypart,
    acceptable_collections: slot.acceptableCollections,
    preferred_collections: slot.preferredCollections,
    intent_tags: slot.intentTags,
    avoid_tags: slot.avoidTags ?? [],
  }
}

function fromApiSlot(slot: ApiShellSlot): DayShellSlot {
  return {
    id: slot.id,
    label: slot.label,
    daypart: slot.daypart,
    acceptableCollections: slot.acceptable_collections,
    preferredCollections: slot.preferred_collections,
    intentTags: slot.intent_tags,
    avoidTags: slot.avoid_tags,
  }
}

function toApiShell(shell: DayShellTemplate): ApiDayShell {
  return {
    id: shell.id,
    name: shell.name,
    description: shell.description,
    slots: shell.slots.map(toApiSlot),
  }
}

function fromApiShell(shell: ApiDayShell): DayShellTemplate {
  return {
    id: shell.id,
    name: shell.name,
    description: shell.description,
    slots: shell.slots.map(fromApiSlot),
  }
}

async function requireOk(response: Response, fallback: string): Promise<void> {
  if (response.ok) return
  const message = await parseErrorResponse(response, fallback, { detail: fallback })
  throw new Error(message)
}

/** List the Day Shell Library (Custom Day Shells; built-ins are frontend constants). */
export async function listLibraryDayShells(): Promise<DayShellTemplate[]> {
  const response = await fetch(`${API_BASE_URL}/itineraries-pipeline/day-shells`)
  await requireOk(response, 'Failed to load the day shell library')
  const payload: { shells: ApiDayShell[] } = await response.json()
  return payload.shells.map(fromApiShell)
}

export async function createLibraryDayShell(shell: DayShellTemplate): Promise<DayShellTemplate> {
  const response = await fetch(`${API_BASE_URL}/itineraries-pipeline/day-shells`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toApiShell(shell)),
  })
  await requireOk(response, 'Failed to save the layout')
  return fromApiShell(await response.json())
}

export async function updateLibraryDayShell(shell: DayShellTemplate): Promise<DayShellTemplate> {
  const response = await fetch(`${API_BASE_URL}/itineraries-pipeline/day-shells/${encodeURIComponent(shell.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toApiShell(shell)),
  })
  await requireOk(response, 'Failed to update the layout')
  return fromApiShell(await response.json())
}

export async function deleteLibraryDayShell(shellId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/itineraries-pipeline/day-shells/${encodeURIComponent(shellId)}`, {
    method: 'DELETE',
  })
  await requireOk(response, 'Failed to delete the layout')
}
