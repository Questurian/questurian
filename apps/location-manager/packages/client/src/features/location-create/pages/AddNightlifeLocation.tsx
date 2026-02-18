import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import { Music2 } from "lucide-react";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import { Textarea } from "@client/components/ui/textarea";
import { Button } from "@client/components/ui/button";
import { useCreateLocation } from "@client/shared/services/api/hooks";
import { addNightlifeSchema, type AddNightlifeFormData } from "../validation/add-nightlife.schema";
import {
  CLUB_TYPE_OPTIONS,
  CROWD_PROFILE_OPTIONS,
  DAYTIME_RESTAURANT_OPTIONS,
  DRESS_CODE_OPTIONS,
  ENERGY_LEVEL_OPTIONS,
  MUSIC_FORMAT_OPTIONS,
  MUSIC_OPTIONS,
  PEAK_HOURS_OPTIONS,
  PRICE_TIER_OPTIONS,
  SPACE_LAYOUT_OPTIONS,
  SPEND_LEVEL_OPTIONS,
  TOURIST_PRESENCE_OPTIONS,
  type NightlifeOption,
  VENUE_SIZE_OPTIONS,
  VENUE_TYPE_OPTIONS,
  VIP_BOTTLE_SERVICE_OPTIONS,
  VIBE_OPTIONS,
} from "../constants/nightlife-options";

function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

type MultiField = "music" | "spaceLayout" | "vibe" | "musicFormat" | "dressCode";

interface OptionTableProps {
  label: string;
  options: NightlifeOption[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

function OptionSelect({ label, options, value, onChange, error }: OptionTableProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground"
      >
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
              <tr key={option.value} className={value === option.value ? "bg-primary/10" : "border-t border-border"}>
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

interface MultiOptionTableProps {
  label: string;
  options: NightlifeOption[];
  values: string[];
  onToggle: (value: string) => void;
  error?: string;
}

function MultiOptionTable({ label, options, values, onToggle, error }: MultiOptionTableProps) {
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
                <tr key={option.value} className={isChecked ? "bg-primary/10 border-t border-border" : "border-t border-border"}>
                  <td className="px-2 py-1.5">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggle(option.value)}
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

export function AddNightlifeLocation() {
  const form = useForm<AddNightlifeFormData>({
    resolver: zodResolver(addNightlifeSchema),
    defaultValues: {
      name: "",
      priceTier: "$$$",
      clubType: "Night Club",
      music: ["House", "EDM"],
      venueType: "Nightclub",
      venueSize: "Large",
      spaceLayout: ["Indoor", "Rooftop"],
      vibe: ["Upscale", "Exclusive", "High-Energy"],
      peakHours: "1:00 AM - 3:30 AM",
      touristPresence: "Low",
      musicFormat: ["Open Format"],
      spendLevel: "$$$",
      dressCode: ["Upscale", "Dress to Impress"],
      energyLevel: "High",
      vipAndBottleService: "Yes",
      crowdProfile: "20-40",
      description: "",
      images: "",
      location: "",
      phone: "",
      hours: "",
      website: "",
      reserveUrl: "",
      daytimeRestaurant: "0",
    },
    mode: "onChange",
  });

  const [createdName, setCreatedName] = useState<string | null>(null);
  const { mutate: createLocation, isPending, error } = useCreateLocation();

  const toggleMultiOption = (field: MultiField, value: string) => {
    const currentValues = (form.getValues(field) || []) as string[];
    const nextValues = currentValues.includes(value)
      ? currentValues.filter((item) => item !== value)
      : [...currentValues, value];

    form.setValue(field, nextValues as any, {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });
  };

  const onSubmit = (data: AddNightlifeFormData) => {
    const music = data.music;
    const spaceLayout = data.spaceLayout;
    const vibe = data.vibe;
    const musicFormat = data.musicFormat;
    const dressCode = data.dressCode;
    const images = splitList(data.images || "");

    const nightlifeDetails = {
      name: data.name,
      price_tier: data.priceTier,
      club_type: data.clubType,
      music,
      details: {
        theSpace: {
          venueType: { label: "Venue Type", value: data.venueType },
          venueSize: { label: "Venue Size", value: data.venueSize },
          spaceLayout: { label: "Layout", value: spaceLayout },
          vibe: { label: "Vibe", value: vibe },
          peakHours: { label: "Peak Hours", value: data.peakHours },
          touristPresence: { label: "Tourist Presence", value: data.touristPresence },
        },
        theScene: {
          musicFormat: { label: "Music", value: musicFormat },
          spendLevel: { label: "Spend Level", value: data.spendLevel },
          dressCode: { label: "Dress Code", value: dressCode },
          energyLevel: { label: "Energy Level", value: data.energyLevel },
          vipAndBottleService: { label: "VIP & Bottle Service", value: data.vipAndBottleService },
          crowdProfile: { label: "Age Range", value: data.crowdProfile },
        },
      },
      description: data.description,
      images,
      location: data.location,
      phone: data.phone || "",
      hours: data.hours || "",
      website: data.website || "",
      reserve_url: data.reserveUrl || "",
      daytime_restaurant: Number(data.daytimeRestaurant),
    };

    createLocation(
      {
        name: data.name,
        address: data.location,
        category: "nightlife",
        type: data.clubType,
        nightlifeDetails,
      },
      {
        onSuccess: (response) => {
          setCreatedName(response.title || response.source.name);
          form.reset();
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-2xl bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Music2 className="w-4 h-4 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground underline">
            Add Nightlife
          </h1>
        </div>

        {createdName && (
          <div className="mb-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
            Created nightlife document: {createdName}
          </div>
        )}

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <section className="space-y-4">
            <h2 className="text-xs font-semibold tracking-wide text-foreground">Core</h2>

            <div className="space-y-2">
              <Label>Name</Label>
              <Input placeholder="Nebula" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <OptionSelect
                label="Price Tier"
                options={PRICE_TIER_OPTIONS}
                value={form.watch("priceTier")}
                onChange={(value) => form.setValue("priceTier", value as AddNightlifeFormData["priceTier"], { shouldValidate: true })}
                error={form.formState.errors.priceTier?.message}
              />
              <OptionSelect
                label="Club Type"
                options={CLUB_TYPE_OPTIONS}
                value={form.watch("clubType")}
                onChange={(value) => form.setValue("clubType", value as AddNightlifeFormData["clubType"], { shouldValidate: true })}
                error={form.formState.errors.clubType?.message}
              />
            </div>

            <MultiOptionTable
              label="Music"
              options={MUSIC_OPTIONS}
              values={form.watch("music")}
              onToggle={(value) => toggleMultiOption("music", value)}
              error={form.formState.errors.music?.message as string | undefined}
            />
          </section>

          <section className="space-y-4">
            <h2 className="text-xs font-semibold tracking-wide text-foreground">The Space</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <OptionSelect
                label="Venue Type"
                options={VENUE_TYPE_OPTIONS}
                value={form.watch("venueType")}
                onChange={(value) => form.setValue("venueType", value as AddNightlifeFormData["venueType"], { shouldValidate: true })}
                error={form.formState.errors.venueType?.message}
              />
              <OptionSelect
                label="Venue Size"
                options={VENUE_SIZE_OPTIONS}
                value={form.watch("venueSize")}
                onChange={(value) => form.setValue("venueSize", value as AddNightlifeFormData["venueSize"], { shouldValidate: true })}
                error={form.formState.errors.venueSize?.message}
              />
            </div>

            <MultiOptionTable
              label="Layout"
              options={SPACE_LAYOUT_OPTIONS}
              values={form.watch("spaceLayout")}
              onToggle={(value) => toggleMultiOption("spaceLayout", value)}
              error={form.formState.errors.spaceLayout?.message as string | undefined}
            />

            <MultiOptionTable
              label="Vibe"
              options={VIBE_OPTIONS}
              values={form.watch("vibe")}
              onToggle={(value) => toggleMultiOption("vibe", value)}
              error={form.formState.errors.vibe?.message as string | undefined}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <OptionSelect
                label="Peak Hours"
                options={PEAK_HOURS_OPTIONS}
                value={form.watch("peakHours")}
                onChange={(value) => form.setValue("peakHours", value as AddNightlifeFormData["peakHours"], { shouldValidate: true })}
                error={form.formState.errors.peakHours?.message}
              />
              <OptionSelect
                label="Tourist Presence"
                options={TOURIST_PRESENCE_OPTIONS}
                value={form.watch("touristPresence")}
                onChange={(value) => form.setValue("touristPresence", value as AddNightlifeFormData["touristPresence"], { shouldValidate: true })}
                error={form.formState.errors.touristPresence?.message}
              />
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xs font-semibold tracking-wide text-foreground">The Scene</h2>
            <MultiOptionTable
              label="Music Format"
              options={MUSIC_FORMAT_OPTIONS}
              values={form.watch("musicFormat")}
              onToggle={(value) => toggleMultiOption("musicFormat", value)}
              error={form.formState.errors.musicFormat?.message as string | undefined}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <OptionSelect
                label="Spend Level"
                options={SPEND_LEVEL_OPTIONS}
                value={form.watch("spendLevel")}
                onChange={(value) => form.setValue("spendLevel", value as AddNightlifeFormData["spendLevel"], { shouldValidate: true })}
                error={form.formState.errors.spendLevel?.message}
              />
              <OptionSelect
                label="Energy Level"
                options={ENERGY_LEVEL_OPTIONS}
                value={form.watch("energyLevel")}
                onChange={(value) => form.setValue("energyLevel", value as AddNightlifeFormData["energyLevel"], { shouldValidate: true })}
                error={form.formState.errors.energyLevel?.message}
              />
              <OptionSelect
                label="VIP & Bottle Service"
                options={VIP_BOTTLE_SERVICE_OPTIONS}
                value={form.watch("vipAndBottleService")}
                onChange={(value) => form.setValue("vipAndBottleService", value as AddNightlifeFormData["vipAndBottleService"], { shouldValidate: true })}
                error={form.formState.errors.vipAndBottleService?.message}
              />
              <OptionSelect
                label="Crowd Profile (Age Range)"
                options={CROWD_PROFILE_OPTIONS}
                value={form.watch("crowdProfile")}
                onChange={(value) => form.setValue("crowdProfile", value as AddNightlifeFormData["crowdProfile"], { shouldValidate: true })}
                error={form.formState.errors.crowdProfile?.message}
              />
            </div>

            <MultiOptionTable
              label="Dress Code"
              options={DRESS_CODE_OPTIONS}
              values={form.watch("dressCode")}
              onToggle={(value) => toggleMultiOption("dressCode", value)}
              error={form.formState.errors.dressCode?.message as string | undefined}
            />
          </section>

          <section className="space-y-4">
            <h2 className="text-xs font-semibold tracking-wide text-foreground">Description & Media</h2>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={4} placeholder="Describe the nightlife venue..." {...form.register("description")} />
              {form.formState.errors.description && (
                <p className="text-xs text-destructive">{form.formState.errors.description.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Images (comma/newline-separated URLs)</Label>
              <Textarea rows={3} placeholder="https://.../image1.jpg, https://.../image2.jpg" {...form.register("images")} />
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xs font-semibold tracking-wide text-foreground">Contact & Access</h2>
            <div className="space-y-2">
              <Label>Location</Label>
              <Input placeholder="42 Industrial Blvd, Warehouse District" {...form.register("location")} />
              {form.formState.errors.location && (
                <p className="text-xs text-destructive">{form.formState.errors.location.message}</p>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input placeholder="+1 (555) 234-5678" {...form.register("phone")} />
              </div>
              <div className="space-y-2">
                <Label>Hours</Label>
                <Input placeholder="Fri-Sat 11 PM - 8 AM" {...form.register("hours")} />
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input placeholder="https://example.com/nebula" {...form.register("website")} />
                {form.formState.errors.website && (
                  <p className="text-xs text-destructive">{form.formState.errors.website.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Reserve URL</Label>
                <Input placeholder="https://example.com/nebula/reserve" {...form.register("reserveUrl")} />
                {form.formState.errors.reserveUrl && (
                  <p className="text-xs text-destructive">{form.formState.errors.reserveUrl.message}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Daytime Restaurant (0 or 1)</Label>
              <select
                value={form.watch("daytimeRestaurant")}
                onChange={(event) => form.setValue("daytimeRestaurant", event.target.value as AddNightlifeFormData["daytimeRestaurant"], { shouldValidate: true })}
                className="w-full h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground"
              >
                {DAYTIME_RESTAURANT_OPTIONS.map((option) => (
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
                    {DAYTIME_RESTAURANT_OPTIONS.map((option) => (
                      <tr key={option.value} className={form.watch("daytimeRestaurant") === option.value ? "bg-primary/10 border-t border-border" : "border-t border-border"}>
                        <td className="px-2 py-1.5 font-medium">{option.label}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{option.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {form.formState.errors.daytimeRestaurant && (
                <p className="text-xs text-destructive">{form.formState.errors.daytimeRestaurant.message}</p>
              )}
            </div>
          </section>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              Error: {error.message}
            </div>
          )}

          <div className="flex gap-3">
            <Button type="button" variant="outline" asChild>
              <Link to="/add">Back</Link>
            </Button>
            <Button type="submit" disabled={!form.formState.isValid || isPending}>
              {isPending ? "Creating..." : "Create Nightlife Document"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
