import { useAuth } from '../../../providers/useAuth'
import '../../youtube2blog/styles/stage-article.css'
import type { EditorialStageArticlePageProps } from '../features/editorial-stage-article/types'
import { EditorialStageArticleProvider } from '../features/editorial-stage-article/context/EditorialStageArticleContext'
import { EditorialStageArticleScreen } from './editorial-stage/EditorialStageArticleScreen'

export default function EditorialStageArticlePage(props: EditorialStageArticlePageProps) {
  const { token } = useAuth()

  return (
    <EditorialStageArticleProvider
      storageKey={props.storageKey}
      routes={props.routes}
      api={props.api}
      token={token}
    >
      <EditorialStageArticleScreen />
    </EditorialStageArticleProvider>
  )
}
