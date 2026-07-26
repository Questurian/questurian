import { buildEditPromptApi } from '../build-edit-prompt.api'
import {
  buildInsertPromptApi,
  type InsertImage
} from '../build-insert-prompt.api'
import { describeSceneApi } from '../describe-scene.api'
import { describeSubjectApi } from '../describe-subject.api'

export type { InsertImage }

export async function describeImageScene(file: File): Promise<string> {
  return describeSceneApi(file)
}

export async function buildImageEditPrompt(
  file: File,
  sceneDescription: string,
  changeRequest: string
): Promise<string> {
  return buildEditPromptApi({ file, sceneDescription, changeRequest })
}

export async function describeImageSubject(file: File): Promise<string> {
  return describeSubjectApi(file)
}

export async function buildImageInsertPrompt(
  file: File,
  sceneDescription: string,
  inserts: InsertImage[],
  changeRequest: string
): Promise<string> {
  return buildInsertPromptApi({
    file,
    sceneDescription,
    inserts,
    changeRequest
  })
}
