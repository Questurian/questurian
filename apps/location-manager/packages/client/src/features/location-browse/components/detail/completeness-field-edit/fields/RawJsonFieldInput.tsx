import { Textarea } from "@client/components/ui";

const RAW_JSON_PLACEHOLDERS: Record<string, string> = {
  nightlifeDetails: '{"name":"Venue Name","price_tier":"$$$"}',
  accommodationsDetails: '{"core":{"name":"The Meridian Grand","price":"$$$$"}}',
  attractionsDetails: '{"core":{"attraction_type":"museum","pricing":"$$"}}',
  keyLocationsDetails: '{"location_type":"airport","status":"active"}',
};

interface RawJsonFieldInputProps {
  fieldKey: string;
  value: string;
  onChange: (value: string) => void;
}

export function RawJsonFieldInput({ fieldKey, value, onChange }: RawJsonFieldInputProps) {
  return (
    <Textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={12}
      placeholder={RAW_JSON_PLACEHOLDERS[fieldKey] ?? "{}"}
      className="font-mono text-xs"
    />
  );
}

export function isRawJsonFieldKey(fieldKey: string) {
  return fieldKey in RAW_JSON_PLACEHOLDERS;
}
