import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import type { LocationLevel } from '@/shared/types'

export type { LocationLevel } from '@/shared/types'

type ContractSection = {
  label: string
  path: string
  levels: LocationLevel[]
}

type LocationGuideContract = {
  version: number
  sectionOrder: string[]
  sections: Record<string, ContractSection>
  sectionPathsByLevel: Record<LocationLevel, string[]>
  fieldPathsByLevel: Record<LocationLevel, string[]>
  aiFieldPaths: string[]
  relationshipHints: {
    neighborhoods: string[]
  }
  highlightRules: {
    min: number
    max: number
    sectionPaths: string[]
  }
  resolution: {
    mediaSectionPath: string
    overlaySectionPaths: string[]
    precedenceByLevel: Record<LocationLevel, string[]>
    emptyValuesDoNotOverride: boolean
    arrayStrategy: string
  }
}

const contractPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../../../location-guide-contract.json',
)

const rawContract = fs.readFileSync(contractPath, 'utf8')

export const LOCATION_GUIDE_CONTRACT: LocationGuideContract = JSON.parse(
  rawContract,
) as LocationGuideContract
