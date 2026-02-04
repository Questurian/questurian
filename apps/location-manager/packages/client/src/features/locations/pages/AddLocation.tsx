import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addLocationSchema, confirmLocationSchema, batchUploadSchema, type AddLocationFormData, type ConfirmLocationFormData, type BatchItem } from "../validation/add-location.schema";
import { useCreateLocation, useUpdateLocation, useLocationTypes, locationsApi } from "@client/shared/services/api";
import { FormInput, FormSelect, FormTagMultiSelect } from "@client/shared/components/forms";
import { SelectItem } from "@client/components/ui";
import { SubmitButton } from "@client/shared/components/ui";
import { MapPin, Check, Upload, FileJson, Copy, CheckCheck, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { LocationCategory } from "@shared/types/location-category";
import { IDEAL_FOR_TAG_GROUPS } from "@shared/types/location-ideal-for";
import { ReviewsFetchPhase } from "../components/add/ReviewsFetchPhase";
import { BatchUploadPhase, type BatchResult } from "../components/add/BatchUploadPhase";
import { Button } from "@client/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@client/components/ui/dialog";
import { useCountries } from "../hooks/useCountries";
import { extractCitiesForCountry, buildLocationKey } from "../utils/filter-utils";

type Phase = "add" | "confirm" | "reviews" | "success" | "batch-input" | "batch-processing" | "batch-complete";
const IDEAL_FOR_OPTION_GROUPS = IDEAL_FOR_TAG_GROUPS.map((group) => ({
  label: group.label,
  options: group.tags.map((tag) => ({ value: tag, label: tag })),
}));

export function AddLocation() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("add");
  const [createdLocation, setCreatedLocation] = useState<{
    id: number;
    name: string;
    title: string;
    phoneNumber?: string;
    website?: string;
    tripadvisorUrl?: string | null;
    placeId?: string | null;
  } | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<LocationCategory | undefined>(undefined);

  // Batch upload state
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [jsonInput, setJsonInput] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isJsonValid, setIsJsonValid] = useState(false);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  // City selection dialog state for "Copy for AI"
  const [isCityDialogOpen, setIsCityDialogOpen] = useState(false);
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(null);
  const [selectedCityValue, setSelectedCityValue] = useState<string | null>(null);
  const [selectedDialogCategory, setSelectedDialogCategory] = useState<LocationCategory | null>(null);
  const [isFetchingLocations, setIsFetchingLocations] = useState(false);
  const { data: countries = [] } = useCountries();

  const { mutate: createLocation, isPending: isCreating, error: createError } = useCreateLocation();
  const { mutate: updateLocation, isPending: isUpdating, error: updateError } = useUpdateLocation();
  const { data: locationTypes = [], isLoading: isLoadingTypes } = useLocationTypes(selectedCategory);

  const addForm = useForm<AddLocationFormData>({
    resolver: zodResolver(addLocationSchema),
    defaultValues: {
      name: "",
      address: "",
      category: undefined,
      idealFor: [],
      type: undefined,
      tripadvisorUrl: "",
    },
  });

  // Watch category changes to update selectedCategory and clear type
  const watchedCategory = addForm.watch("category");
  useEffect(() => {
    if (watchedCategory !== selectedCategory) {
      setSelectedCategory(watchedCategory);
      // Clear type when category changes
      addForm.setValue("type", undefined);
    }
  }, [watchedCategory, selectedCategory, addForm]);

  const confirmForm = useForm<ConfirmLocationFormData>({
    resolver: zodResolver(confirmLocationSchema),
    defaultValues: {
      title: "",
      phoneNumber: "",
      website: "",
    },
  });

  function handleAddLocation(data: AddLocationFormData) {
    createLocation(data, {
      onSuccess: (response) => {
        setCreatedLocation({
          id: response.id,
          name: response.source.name,
          title: response.title || response.source.name,
          phoneNumber: response.contact?.phoneNumber || undefined,
          website: response.contact?.website || undefined,
          tripadvisorUrl: response.tripadvisorUrl,
          placeId: response.placeId,
        });
        confirmForm.setValue("title", response.title || response.source.name);
        confirmForm.setValue("phoneNumber", response.contact?.phoneNumber || "");
        confirmForm.setValue("website", response.contact?.website || "");
        setPhase("confirm");
        addForm.reset();
      },
      onError: (error) => {
        console.error("Create location error:", error);
      },
    });
  }

  function handleConfirmTitle(data: ConfirmLocationFormData) {
    if (!createdLocation) return;

    updateLocation({
      id: createdLocation.id,
      data: {
        title: data.title,
        phoneNumber: data.phoneNumber,
        website: data.website
      }
    }, {
      onSuccess: () => {
        // Go to reviews phase instead of success
        setPhase("reviews");
      },
      onError: (error) => {
        console.error("Update location error:", error);
        // Show the error to the user
        alert(`Update failed: ${error.message}`);
      },
    });
  }

  // Real-time JSON validation
  const validateJsonInput = (input: string) => {
    if (!input.trim()) {
      setJsonError(null);
      setIsJsonValid(false);
      return;
    }

    try {
      const parsed = JSON.parse(input);
      const result = batchUploadSchema.safeParse(parsed);
      if (!result.success) {
        const errorMessages = result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
        setJsonError(`Validation error: ${errorMessages}`);
        setIsJsonValid(false);
        return;
      }
      setJsonError(null);
      setIsJsonValid(true);
    } catch {
      setJsonError("Invalid JSON format. Please check your input.");
      setIsJsonValid(false);
    }
  };

  // Batch JSON input phase - start upload
  const handleStartUpload = () => {
    if (!isJsonValid) return;

    try {
      const parsed = JSON.parse(jsonInput);
      const result = batchUploadSchema.safeParse(parsed);
      if (result.success) {
        setBatchItems(result.data);
        setPhase("batch-processing");
      }
    } catch {
      // Already validated, this shouldn't happen
    }
  };

  const handleBatchComplete = (results: BatchResult[]) => {
    setBatchResults(results);
    setPhase("batch-complete");
  };

  const handleBatchCancel = () => {
    setPhase("add");
    setBatchItems([]);
    setJsonInput("");
    setJsonError(null);
    setIsJsonValid(false);
  };

  const AI_PROMPT_TEMPLATE = `I need you to generate a JSON array for batch uploading locations. Here's the format:

## Required Fields:
- **name** (string) - Location name (e.g., "Asu Restaurant", "The Rooftop Bar")
- **address** (string) - Full address including city and country
- **category** (string) - One of: "dining", "accommodations", "attractions", "nightlife"
- **idealFor** (array) - 1 to 4 tags from this list:

  Occasions & Company: "Birthdays & Celebrations", "Business Dining", "Date Nights", "Family-Friendly", "First Dates", "Impressing Visitors", "Large Groups & Parties", "Pre-Theater", "Private Dining", "Catch-Up Conversations", "Friends' Night Out", "Solo Dining", "Special Occasions"

  Meal Moments: "Afternoon & Daytime Drinks", "Breakfast", "Brunch", "Coffee & Light Bites", "Happy Hour", "Late-Night & Party Scene", "Late-Night Cravings", "Lunch"

  Dining Style: "Budget-Friendly", "Casual Dining", "Classic & Traditional", "Experiential Dining", "Fine Dining", "Healthy Eating", "Tapas & Small Plates"

  Drinks & Nightlife: "Craft Beer", "Craft Cocktails", "Live Music", "Sports Bar", "Trendy Hot Spots", "Wine Bars"

  Service & Atmosphere: "BYOB-Friendly", "Bar Seating", "Outdoor Seating", "Takeout & Delivery", "Walk-In Friendly"

## Optional Fields:
- **type** (string) - Specific type like "Italian Restaurant", "Boutique Hotel", etc.
- **tripadvisorUrl** (string) - Full TripAdvisor URL

## TripAdvisor URL Format:
Example: https://www.tripadvisor.com/Restaurant_Review-g294316-d23520604-Reviews-Asu-Lima_Lima_Region.html

Breakdown:
- Restaurant_Review = Type (Restaurant_Review, Hotel_Review, Attraction_Review)
- g294316 = City/Region ID
- d23520604 = Location ID (this is what we extract)
- Asu = Location name slug
- Lima_Lima_Region = City and region

## Example Output:
\`\`\`json
[
  {
    "name": "Asu",
    "address": "Av. La Mar 1337, Miraflores, Lima, Peru",
    "category": "dining",
    "idealFor": ["Date Nights", "Fine Dining", "Impressing Visitors"],
    "tripadvisorUrl": "https://www.tripadvisor.com/Restaurant_Review-g294316-d23520604-Reviews-Asu-Lima_Lima_Region.html"
  },
  {
    "name": "The Rooftop Bar",
    "address": "456 Ocean Drive, Miami Beach, FL, USA",
    "category": "nightlife",
    "idealFor": ["Trendy Hot Spots", "Craft Cocktails"]
  }
]
\`\`\`

Please generate the JSON for these locations:
[PASTE YOUR LOCATIONS HERE]`;

  // Open the city selection dialog
  const handleCopyForAI = () => {
    setIsCityDialogOpen(true);
  };

  // Get cities for selected country
  const availableCities = selectedCountryCode
    ? extractCitiesForCountry(countries, selectedCountryCode)
    : [];

  // Handle the actual copy after city selection
  const handleConfirmCityAndCopy = async () => {
    if (!selectedCountryCode || !selectedCityValue) return;

    setIsFetchingLocations(true);

    try {
      // Build locationKey for the selected city
      const locationKey = buildLocationKey(countries, selectedCountryCode, selectedCityValue, null);

      // Fetch existing locations for this city (optionally filtered by category)
      const response = await locationsApi.getLocationsBasic({
        locationKey,
        ...(selectedDialogCategory && { category: selectedDialogCategory }),
      });
      const existingNames = response.locations.map((loc) => loc.title || loc.name);

      // Find the city label for display
      const selectedCity = availableCities.find((c) => c.value === selectedCityValue);
      const cityLabel = selectedCity?.label || selectedCityValue;
      const countryLabel = countries.find((c) => c.code === selectedCountryCode)?.label || selectedCountryCode;

      // Build category label for display
      const categoryLabel = selectedDialogCategory
        ? selectedDialogCategory.charAt(0).toUpperCase() + selectedDialogCategory.slice(1)
        : "All Categories";

      // Build enhanced prompt with existing locations
      const locationDescription = selectedDialogCategory
        ? `${categoryLabel} in ${cityLabel}, ${countryLabel}`
        : `${cityLabel}, ${countryLabel}`;

      const existingLocationsSection = existingNames.length > 0
        ? `\n\n## IMPORTANT - Existing ${categoryLabel} Locations in ${cityLabel}, ${countryLabel}:\nThe following locations are ALREADY in the database. Do NOT include these in your output:\n${existingNames.map((name) => `- ${name}`).join("\n")}\n`
        : `\n\n## Note: No existing ${categoryLabel.toLowerCase()} locations found for ${cityLabel}, ${countryLabel}\n`;

      const enhancedPrompt = AI_PROMPT_TEMPLATE.replace(
        "[PASTE YOUR LOCATIONS HERE]",
        `[PASTE YOUR ${selectedDialogCategory ? selectedDialogCategory.toUpperCase() + " " : ""}LOCATIONS FOR ${cityLabel.toUpperCase()}, ${countryLabel.toUpperCase()} HERE]`
      ) + existingLocationsSection;

      // Copy to clipboard
      await navigator.clipboard.writeText(enhancedPrompt);
      setCopiedToClipboard(true);
      setTimeout(() => setCopiedToClipboard(false), 2000);

      // Close dialog and reset
      setIsCityDialogOpen(false);
      setSelectedCountryCode(null);
      setSelectedCityValue(null);
      setSelectedDialogCategory(null);
    } catch (err) {
      console.error("Failed to fetch locations or copy:", err);
    } finally {
      setIsFetchingLocations(false);
    }
  };

  // Batch input phase
  if (phase === "batch-input") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div data-theme="light" className="w-full max-w-2xl bg-background rounded-xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
              onClick={handleCopyForAI}
              className="flex items-center gap-1.5"
            >
              {copiedToClipboard ? (
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
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-700 mb-2">
              Paste a JSON array of locations. Each item should have:
            </p>
            <ul className="text-xs text-blue-600 list-disc list-inside space-y-1">
              <li><strong>name</strong> (required) - Location name</li>
              <li><strong>address</strong> (required) - Full address including city and country</li>
              <li><strong>category</strong> (required) - dining, accommodations, attractions, or nightlife</li>
              <li><strong>idealFor</strong> (required) - Array of 1-4 tags (see "Copy for AI" for full list)</li>
              <li><strong>type</strong> (optional) - Location type</li>
              <li><strong>tripadvisorUrl</strong> (optional) - Full TripAdvisor URL</li>
            </ul>
          </div>

          {/* TripAdvisor URL breakdown */}
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
            <p className="text-xs font-medium text-amber-800 mb-2">TripAdvisor URL Format:</p>
            <code className="text-xs text-amber-700 break-all block mb-2">
              https://www.tripadvisor.com/Restaurant_Review-g294316-d23520604-Reviews-Asu-Lima_Lima_Region.html
            </code>
            <div className="text-xs text-amber-600 space-y-0.5">
              <p><span className="font-mono bg-amber-100 px-1 rounded">Restaurant_Review</span> — Type (Restaurant_Review, Hotel_Review, Attraction_Review)</p>
              <p><span className="font-mono bg-amber-100 px-1 rounded">g294316</span> — City/Region ID</p>
              <p><span className="font-mono bg-amber-100 px-1 rounded">d23520604</span> — Location ID (extracted automatically)</p>
              <p><span className="font-mono bg-amber-100 px-1 rounded">Asu</span> — Location name slug</p>
              <p><span className="font-mono bg-amber-100 px-1 rounded">Lima_Lima_Region</span> — City and region</p>
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
              {jsonInput.trim() && !jsonError && isJsonValid && (
                <span className="text-xs text-green-600 font-medium">✓ Valid JSON</span>
              )}
            </div>
            <textarea
              value={jsonInput}
              onChange={(e) => {
                setJsonInput(e.target.value);
                validateJsonInput(e.target.value);
              }}
              placeholder="Paste your JSON array here..."
              className={`w-full h-48 p-3 text-sm font-mono border rounded-md bg-white text-gray-900 resize-none focus:outline-none focus:ring-2 ${
                jsonError
                  ? "border-red-300 focus:ring-red-500"
                  : isJsonValid
                    ? "border-green-300 focus:ring-green-500"
                    : "focus:ring-blue-500"
              }`}
            />
          </div>

          {/* Error message */}
          {jsonError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{jsonError}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              onClick={() => {
                setPhase("add");
                setJsonInput("");
                setJsonError(null);
                setIsJsonValid(false);
              }}
              variant="outline"
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleStartUpload}
              disabled={!isJsonValid}
              className="flex-1"
            >
              Start Upload
            </Button>
          </div>
        </div>

        {/* City Selection Dialog for Copy for AI */}
        <Dialog open={isCityDialogOpen} onOpenChange={setIsCityDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Select City for AI Prompt</DialogTitle>
              <DialogDescription>
                Choose a city to include existing locations in the AI prompt. This helps avoid duplicate entries.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Country Selection */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Country
                </label>
                <select
                  value={selectedCountryCode || ""}
                  onChange={(e) => {
                    setSelectedCountryCode(e.target.value || null);
                    setSelectedCityValue(null);
                  }}
                  className="w-full h-10 px-3 text-sm border rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a country...</option>
                  {countries.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* City Selection */}
              {selectedCountryCode && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    City
                  </label>
                  <select
                    value={selectedCityValue || ""}
                    onChange={(e) => setSelectedCityValue(e.target.value || null)}
                    className="w-full h-10 px-3 text-sm border rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a city...</option>
                    {availableCities.map((city) => (
                      <option key={city.value} value={city.value}>
                        {city.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Category Selection (Optional) */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Category <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <select
                  value={selectedDialogCategory || ""}
                  onChange={(e) => setSelectedDialogCategory((e.target.value || null) as LocationCategory | null)}
                  className="w-full h-10 px-3 text-sm border rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All categories</option>
                  <option value="dining">Dining</option>
                  <option value="accommodations">Accommodations</option>
                  <option value="attractions">Attractions</option>
                  <option value="nightlife">Nightlife</option>
                </select>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => {
                  setIsCityDialogOpen(false);
                  setSelectedCountryCode(null);
                  setSelectedCityValue(null);
                  setSelectedDialogCategory(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmCityAndCopy}
                disabled={!selectedCountryCode || !selectedCityValue || isFetchingLocations}
              >
                {isFetchingLocations ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Copy Prompt"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Batch processing phase
  if (phase === "batch-processing" && batchItems.length > 0) {
    return (
      <BatchUploadPhase
        items={batchItems}
        onComplete={handleBatchComplete}
        onCancel={handleBatchCancel}
      />
    );
  }

  // Batch complete phase
  if (phase === "batch-complete") {
    const successCount = batchResults.filter((r) => r.success).length;
    const failedCount = batchResults.filter((r) => !r.success).length;

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div data-theme="light" className="w-full max-w-lg bg-background rounded-xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Header */}
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center">
              <Check className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-[24px]! opacity-70 font-medium text-foreground">Batch Upload Complete</h1>
          </div>

          {/* Summary */}
          <div className="mb-6 grid grid-cols-2 gap-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-md text-center">
              <p className="text-2xl font-semibold text-green-700">{successCount}</p>
              <p className="text-sm text-green-600">Successful</p>
            </div>
            {failedCount > 0 && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md text-center">
                <p className="text-2xl font-semibold text-red-700">{failedCount}</p>
                <p className="text-sm text-red-600">Failed</p>
              </div>
            )}
          </div>

          {/* Results list */}
          {batchResults.length > 0 && (
            <div className="mb-6 max-h-64 overflow-y-auto border rounded-md divide-y">
              {batchResults.map((result, index) => (
                <div
                  key={index}
                  className={`p-3 flex items-start gap-3 ${result.success ? "bg-green-50" : "bg-red-50"}`}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {result.success ? (
                      <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                        <span className="text-white text-xs">!</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">
                      {result.locationName || result.item.name || result.item.address}
                    </p>
                    {result.error && (
                      <p className="text-xs text-red-600">{result.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              onClick={() => {
                setPhase("add");
                setBatchItems([]);
                setBatchResults([]);
                setJsonInput("");
                setJsonError(null);
                setIsJsonValid(false);
              }}
              variant="outline"
              className="flex-1"
            >
              Add More
            </Button>
            <Button onClick={() => navigate("/")} className="flex-1">
              Done
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "confirm" && createdLocation) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div data-theme="light" className="w-full max-w-sm bg-background rounded-xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Header with icon and title */}
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center">
              <Check className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-[24px]! opacity-70 font-medium text-foreground">Confirm Location Details</h1>
          </div>

          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-700">
              ✓ Location "{createdLocation.name}" added successfully!
            </p>
          </div>

          <form onSubmit={confirmForm.handleSubmit(handleConfirmTitle)} className="space-y-4">
            <FormInput
              name="title"
              label="Display Title"
              control={confirmForm.control}
              placeholder="Clean display title"
              description={`Current: "${createdLocation.title}"`}
            />

            <FormInput
              name="phoneNumber"
              label="Phone Number"
              control={confirmForm.control}
              placeholder="Phone number (optional)"
              description={`Current: ${createdLocation.phoneNumber || "None"}`}
            />

            <FormInput
              name="website"
              label="Website"
              control={confirmForm.control}
              placeholder="https://example.com (optional)"
              description={`Current: ${createdLocation.website || "None"}`}
            />

            <SubmitButton
              isLoading={isUpdating}
              submitText="Confirm Details"
              submittingText="Updating..."
              disabled={!confirmForm.formState.isValid}
              className="w-full h-10 mt-2 text-sm font-normal bg-primary text-primary-foreground hover:bg-primary/90"
            />

            {updateError && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                Error: {updateError.message}
              </div>
            )}
          </form>
        </div>
      </div>
    );
  }

  if (phase === "reviews" && createdLocation) {
    return (
      <ReviewsFetchPhase
        locationId={createdLocation.id}
        locationName={createdLocation.title || createdLocation.name}
        tripadvisorUrl={createdLocation.tripadvisorUrl || null}
        placeId={createdLocation.placeId || null}
        onComplete={() => setPhase("success")}
        onSkip={() => setPhase("success")}
      />
    );
  }

  if (phase === "success" && createdLocation) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div data-theme="light" className="w-full max-w-sm bg-background rounded-xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Header with icon and title */}
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center">
              <Check className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-[24px]! opacity-70 font-medium text-foreground">Location Added Successfully</h1>
          </div>

          <div className="mb-6 p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-700">
              ✓ Location "{createdLocation.title}" has been added successfully!
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => {
                setPhase("add");
                setCreatedLocation(null);
                setSelectedCategory(undefined);
                confirmForm.reset();
                addForm.reset();
              }}
              className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-normal"
            >
              Add Another Location
            </button>

            <button
              onClick={() => {
                navigate("/");
              }}
              className="w-full h-10 bg-muted text-muted-foreground hover:bg-muted/90 rounded-md text-sm font-normal"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div data-theme="light" className="w-full max-w-sm bg-background rounded-xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Header with icon and title */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
              <MapPin className="w-4 h-4 text-muted-foreground" />
            </div>
            <h1 className="text-[24px]! opacity-70 font-medium text-foreground">Add Location</h1>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPhase("batch-input")}
            className="flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            Batch
          </Button>
        </div>

        <form onSubmit={addForm.handleSubmit(handleAddLocation)} className="space-y-4">
          <FormInput
            name="name"
            label="Name"
            control={addForm.control}
            placeholder="Location Name"
          />

          <FormInput
            name="address"
            label="Address"
            control={addForm.control}
            placeholder="123 Main St, City, State, Country"
          />

          <FormSelect
            name="category"
            label="Category"
            control={addForm.control}
            placeholder="Select a category"
          >
            <SelectItem value="dining">Dining</SelectItem>
            <SelectItem value="accommodations">Accommodations</SelectItem>
            <SelectItem value="attractions">Attractions</SelectItem>
            <SelectItem value="nightlife">Nightlife</SelectItem>
          </FormSelect>

          {selectedCategory && (
            <FormSelect
              name="type"
              label="Type"
              control={addForm.control}
              placeholder={isLoadingTypes ? "Loading types..." : "Select a type"}
              disabled={isLoadingTypes}
            >
              {locationTypes.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </FormSelect>
          )}

          <FormTagMultiSelect
            name="idealFor"
            label="Ideal For"
            control={addForm.control}
            optionGroups={IDEAL_FOR_OPTION_GROUPS}
            maxSelections={4}
            description="Choose 1 to 4 tags"
            allowDirectTagArrayInput
          />

          <FormInput
            name="tripadvisorUrl"
            label="TripAdvisor URL"
            control={addForm.control}
            placeholder="https://www.tripadvisor.com/..."
            description="Optional — used to extract the TripAdvisor location ID"
          />

          <SubmitButton
            isLoading={isCreating}
            submitText="Add Location"
            submittingText="Adding Location..."
            disabled={!addForm.formState.isValid}
            className="w-full h-10 mt-2 text-sm font-normal bg-primary text-primary-foreground hover:bg-primary/90"
          />

          {createError && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-600">
              Error: {createError.message}
            </div>
          )}

        </form>
      </div>
    </div>
  );
}
