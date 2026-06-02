import { Label } from "@client/components/ui/label";

export interface OptionTableFieldOption {
  value: string;
  label: string;
  description: string;
}

interface OptionTableFieldEditorProps {
  label: string;
  kind: "single" | "multi" | "boolean";
  options: OptionTableFieldOption[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  error?: string;
  placeholder?: string;
}

export function OptionTableFieldEditor({
  label,
  kind,
  options,
  value,
  onChange,
  error,
  placeholder = "Select an option",
}: OptionTableFieldEditorProps) {
  if (kind === "multi") {
    const values = Array.isArray(value) ? value : [];

    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-2 py-1.5 font-medium w-24">Select</th>
                <th className="text-left px-2 py-1.5 font-medium w-44">Option</th>
                <th className="text-left px-2 py-1.5 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {options.map((option) => {
                const isChecked = values.includes(option.value);

                return (
                  <tr
                    key={option.value}
                    className={
                      isChecked ? "bg-primary/10 border-t border-border" : "border-t border-border"
                    }
                  >
                    <td className="px-2 py-1.5">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() =>
                            onChange(
                              isChecked
                                ? values.filter((item) => item !== option.value)
                                : [...values, option.value]
                            )
                          }
                        />
                        <span className="text-[11px]">{isChecked ? "Selected" : "Select"}</span>
                      </label>
                    </td>
                    <td className="px-2 py-1.5 font-medium">{option.label}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{option.description}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  const selectedValue = typeof value === "string" ? value : "";

  if (kind === "boolean") {
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-2 py-1.5 font-medium w-24">Select</th>
                <th className="text-left px-2 py-1.5 font-medium w-44">Option</th>
                <th className="text-left px-2 py-1.5 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {options.map((option) => {
                const isChecked = selectedValue === option.value;

                return (
                  <tr
                    key={option.value}
                    className={
                      isChecked ? "bg-primary/10 border-t border-border" : "border-t border-border"
                    }
                  >
                    <td className="px-2 py-1.5">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={label}
                          checked={isChecked}
                          onChange={() => onChange(option.value)}
                        />
                        <span className="text-[11px]">{isChecked ? "Selected" : "Select"}</span>
                      </label>
                    </td>
                    <td className="px-2 py-1.5 font-medium">{option.label}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{option.description}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <select
        value={selectedValue}
        onChange={(event) => onChange(event.target.value)}
        className="w-full h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-2 py-1.5 font-medium">Option</th>
              <th className="text-left px-2 py-1.5 font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            {options.map((option) => (
              <tr
                key={option.value}
                className={selectedValue === option.value ? "bg-primary/10" : "border-t border-border"}
              >
                <td className="px-2 py-1.5 font-medium">{option.label}</td>
                <td className="px-2 py-1.5 text-muted-foreground">{option.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
