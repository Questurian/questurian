import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildEditPromptApi } from '../build-edit-prompt.api'
import { buildInsertPromptApi } from '../build-insert-prompt.api'
import { describeSceneApi } from '../describe-scene.api'
import { describeSubjectApi } from '../describe-subject.api'
import {
  buildImageEditPrompt,
  buildImageInsertPrompt,
  describeImageScene,
  describeImageSubject
} from './image-analysis-prompts.api'

vi.mock('../build-edit-prompt.api', () => ({
  buildEditPromptApi: vi.fn()
}))

vi.mock('../build-insert-prompt.api', () => ({
  buildInsertPromptApi: vi.fn()
}))

vi.mock('../describe-scene.api', () => ({
  describeSceneApi: vi.fn()
}))

vi.mock('../describe-subject.api', () => ({
  describeSubjectApi: vi.fn()
}))

describe('image analysis and prompt public API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('delegates scene and subject analysis', async () => {
    const sceneFile = new File(['scene'], 'scene.webp')
    const subjectFile = new File(['subject'], 'subject.webp')
    vi.mocked(describeSceneApi).mockResolvedValue('Scene description')
    vi.mocked(describeSubjectApi).mockResolvedValue('Subject description')

    await expect(describeImageScene(sceneFile)).resolves.toBe(
      'Scene description'
    )
    await expect(describeImageSubject(subjectFile)).resolves.toBe(
      'Subject description'
    )
    expect(describeSceneApi).toHaveBeenCalledWith(sceneFile)
    expect(describeSubjectApi).toHaveBeenCalledWith(subjectFile)
  })

  it('maps edit prompt arguments to the focused transport API', async () => {
    const file = new File(['scene'], 'scene.webp')
    vi.mocked(buildEditPromptApi).mockResolvedValue('Edit prompt')

    await expect(
      buildImageEditPrompt(file, 'A city street', 'Make it dusk')
    ).resolves.toBe('Edit prompt')
    expect(buildEditPromptApi).toHaveBeenCalledWith({
      file,
      sceneDescription: 'A city street',
      changeRequest: 'Make it dusk'
    })
  })

  it('preserves insert order and descriptions in the delegated payload', async () => {
    const file = new File(['scene'], 'scene.webp')
    const inserts = [
      {
        file: new File(['person'], 'person.webp'),
        description: 'A cyclist'
      },
      {
        file: new File(['dog'], 'dog.webp'),
        description: 'A brown dog'
      }
    ]
    vi.mocked(buildInsertPromptApi).mockResolvedValue('Insert prompt')

    await expect(
      buildImageInsertPrompt(
        file,
        'A city street',
        inserts,
        'Place them on the right'
      )
    ).resolves.toBe('Insert prompt')
    expect(buildInsertPromptApi).toHaveBeenCalledWith({
      file,
      sceneDescription: 'A city street',
      inserts,
      changeRequest: 'Place them on the right'
    })
  })
})
