import { FileJson, Copy, CheckCheck } from "lucide-react";
import { Button } from "@client/components/ui/button";
import { CitySelectionDialog } from "./CitySelectionDialog";
import type { useBatchUploadFlow } from "../hooks/useBatchUploadFlow";
import type { useCopyForAI } from "../hooks/useCopyForAI";

interface BatchInputPhaseProps {
  batch: ReturnType<typeof useBatchUploadFlow>;
  copyForAI: ReturnType<typeof useCopyForAI>;
  onCancel: () => void;
}

export function BatchInputPhase({ batch, copyForAI, onCancel }: BatchInputPhaseProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-2xl bg-card border border-border rounded-xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
              <FileJson className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-[24px]! opacity-70 font-medium text-foreground">Batch Upload</h1>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copyForAI.openDialog}
            className="flex items-center gap-1.5"
          >
            {copyForAI.copiedToClipboard ? (
              <>
                <CheckCheck className="w-3.5 h-3.5 text-green-500" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy for AI
              </>
            )}
          </Button>
        </div>

        {/* Instructions */}
        <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-md">
          <p className="text-sm text-blue-400 mb-2">
            Paste a JSON array of locations. Each item should have:
          </p>
          <ul className="text-xs text-blue-400/80 list-disc list-inside space-y-1">
            <li><strong>name</strong> (required) - Location name</li>
            <li><strong>address</strong> (required) - Full address including city and country</li>
            <li><strong>category</strong> (required) - dining, accommodations, attractions, or nightlife</li>
            <li><strong>idealFor</strong> (required for dining/attractions) - Array of 1-4 tags from that item&apos;s category list</li>
            <li><strong>type</strong> (optional) - Location type</li>
            <li><strong>tripadvisorUrl</strong> (optional) - Full TripAdvisor URL</li>
          </ul>
        </div>

        {/* TripAdvisor URL breakdown */}
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md">
          <p className="text-xs font-medium text-amber-400 mb-2">TripAdvisor URL Format:</p>
          <code className="text-xs text-amber-400/80 break-all block mb-2">
            https://www.tripadvisor.com/Restaurant_Review-g294316-d23520604-Reviews-Asu-Lima_Lima_Region.html
          </code>
          <div className="text-xs text-amber-400/70 space-y-0.5">
            <p><span className="font-mono bg-amber-500/20 px-1 rounded">Restaurant_Review</span> — Type (Restaurant_Review, Hotel_Review, Attraction_Review)</p>
            <p><span className="font-mono bg-amber-500/20 px-1 rounded">g294316</span> — City/Region ID</p>
            <p><span className="font-mono bg-amber-500/20 px-1 rounded">d23520604</span> — Location ID (extracted automatically)</p>
            <p><span className="font-mono bg-amber-500/20 px-1 rounded">Asu</span> — Location name slug</p>
            <p><span className="font-mono bg-amber-500/20 px-1 rounded">Lima_Lima_Region</span> — City and region</p>
          </div>
        </div>

        {/* Example JSON */}
        <div className="mb-4 p-3 bg-muted rounded-md">
          <p className="text-xs text-muted-foreground mb-2">Example:</p>
          <pre className="text-xs text-foreground overflow-x-auto whitespace-pre-wrap">
{`[
  {
    "name": "Asu",
    "address": "Av. La Mar 1337, Miraflores, Lima, Peru",
    "category": "dining",
    "idealFor": ["Date Nights", "Fine Dining", "Impressing Visitors"],
    "tripadvisorUrl": "https://www.tripadvisor.com/Restaurant_Review-g294316-d23520604-Reviews-Asu-Lima_Lima_Region.html"
  }
]`}
          </pre>
        </div>

        {/* JSON input */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-foreground">
              JSON Data
            </label>
            {batch.jsonInput.trim() && !batch.jsonError && batch.isJsonValid && (
              <span className="text-xs text-emerald-400 font-medium">Valid JSON</span>
            )}
          </div>
          <textarea
            value={batch.jsonInput}
            onChange={(e) => batch.handleJsonChange(e.target.value)}
            placeholder="Paste your JSON array here..."
            className={`w-full h-48 p-3 text-sm font-mono border rounded-md bg-muted/50 text-foreground border-border resize-none focus:outline-none focus:ring-2 ${
              batch.jsonError
                ? "border-red-500/50 focus:ring-red-500"
                : batch.isJsonValid
                  ? "border-emerald-500/50 focus:ring-emerald-500"
                  : "focus:ring-primary"
            }`}
          />
        </div>

        {/* Error message */}
        {batch.jsonError && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-md">
            <p className="text-sm text-red-400">{batch.jsonError}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button onClick={onCancel} variant="outline" className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={batch.handleStartUpload}
            disabled={!batch.isJsonValid}
            className="flex-1"
          >
            Start Upload
          </Button>
        </div>
      </div>

      <CitySelectionDialog
        open={copyForAI.isCityDialogOpen}
        onOpenChange={(open) => { if (!open) copyForAI.closeDialog(); }}
        countries={copyForAI.countries}
        availableCities={copyForAI.availableCities}
        selectedCountryCode={copyForAI.selectedCountryCode}
        selectedCityValue={copyForAI.selectedCityValue}
        selectedCategory={copyForAI.selectedDialogCategory}
        isFetching={copyForAI.isFetchingLocations}
        onCountryChange={copyForAI.handleCountryChange}
        onCityChange={copyForAI.setCityValue}
        onCategoryChange={copyForAI.setCategory}
        onConfirm={copyForAI.handleConfirmAndCopy}
        onCancel={copyForAI.closeDialog}
      />
    </div>
  );
}
