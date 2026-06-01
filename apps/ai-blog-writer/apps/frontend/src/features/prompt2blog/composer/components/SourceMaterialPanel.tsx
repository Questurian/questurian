import type { RawBlob } from '../composer.types'

interface SourceMaterialPanelProps {
  blobs: RawBlob[]
  onAdd: () => void
  onClear: () => void
  onRemove: (id: number) => void
  onUpdate: (id: number, content: string) => void
}

export function SourceMaterialPanel(props: SourceMaterialPanelProps) {
  return <section className="p2b-panel">
    <div className="p2b-panel-header"><div className="p2b-panel-header-text"><h2>Source Material</h2><p>Paste source text blocks. Messy copy-paste is cleaned in pipeline.</p></div><button type="button" className="p2b-section-clear-btn" onClick={props.onClear}>Clear section</button></div>
    <div className="p2b-panel-body">
      {props.blobs.map((blob, index) => <div key={blob.id} className="p2b-source-block">
        <label htmlFor={`p2b-blob-${blob.id}`}>Source Block {index + 1}</label>
        <textarea id={`p2b-blob-${blob.id}`} className="p2b-textarea" rows={6} value={blob.content} onChange={event => props.onUpdate(blob.id, event.target.value)} placeholder="Paste raw text, copied article sections, notes, etc." />
        <div className="p2b-button-row"><button type="button" className="p2b-clear-btn" onClick={() => props.onRemove(blob.id)}>Remove Block</button></div>
      </div>)}
      <div className="p2b-button-row"><button type="button" className="p2b-rerun-btn" onClick={props.onAdd}>Add Source Block</button></div>
    </div>
  </section>
}
