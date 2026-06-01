import { Button, Input, Label } from "@client/components/ui";
import { Copy } from "lucide-react";
import type { CoordinateDraft } from "../completeness-field-edit.types";

interface CoordinatesFieldEditorProps {
  value: CoordinateDraft;
  onChange: (value: CoordinateDraft) => void;
  onCopy: (text: string, label: string) => void;
}

export function CoordinatesFieldEditor({ value, onChange, onCopy }: CoordinatesFieldEditorProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="edit-coordinates-lat">Latitude</Label>
          <Input id="edit-coordinates-lat" type="number" step="any" value={value.lat} onChange={(event) => onChange({ ...value, lat: event.target.value })} placeholder="-12.0464" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-coordinates-lng">Longitude</Label>
          <Input id="edit-coordinates-lng" type="number" step="any" value={value.lng} onChange={(event) => onChange({ ...value, lng: event.target.value })} placeholder="-77.0428" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => onCopy(value.lat, "Latitude")} disabled={!value.lat.trim()}>
          <Copy className="h-3.5 w-3.5" />
          Copy Lat
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => onCopy(value.lng, "Longitude")} disabled={!value.lng.trim()}>
          <Copy className="h-3.5 w-3.5" />
          Copy Lng
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => onCopy(`${value.lat.trim()}, ${value.lng.trim()}`, "Coordinates")} disabled={!value.lat.trim() || !value.lng.trim()}>
          <Copy className="h-3.5 w-3.5" />
          Copy Both
        </Button>
      </div>
    </div>
  );
}
