import { useEffect, useRef, useState } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, Clock, Music2 } from 'lucide-react';
import { Input } from '@client/components/ui/input';
import { Label } from '@client/components/ui/label';
import { Button } from '@client/components/ui/button';
import { FormTagMultiSelect } from '@client/shared/components/forms';
import { locationsApi } from '@client/shared/services/api';
import { useCreateLocation } from '@client/shared/services/api/hooks';
import { addNightlifeSchema, type AddNightlifeFormData } from '../validation/add-nightlife.schema';
import { OperationHoursModal } from '../components/OperationHoursModal';
import { buildOperationHoursSummary, isOperationHoursJson } from '../components/operation-hours-utils';
import { getIdealForOptionGroups } from '../constants/ai-prompt-template';
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
  TOURIST_PRESENCE_OPTIONS,
  type NightlifeOption,
  VENUE_SIZE_OPTIONS,
  VENUE_TYPE_OPTIONS,
  VIP_BOTTLE_SERVICE_OPTIONS,
  VIBE_OPTIONS,
} from '../constants/nightlife-options';

type MultiField = 'music' | 'spaceLayout' | 'vibe' | 'musicFormat' | 'dressCode';
type NightlifeFormSection = 'step1' | 'entities' | 'core' | 'space' | 'scene' | 'contact';

interface OptionTableProps {
  label: string;
  options: NightlifeOption[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

interface SectionHeaderProps {
  title: string;
  isComplete?: boolean;
  helperText?: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

function normalizeAddress(address: string) {
  return address.trim();
}

function buildPrefillSignature(name: string, address: string) {
  return `${name.trim().toLowerCase()}|${normalizeAddress(address).toLowerCase()}`;
}

const NIGHTLIFE_DRAFT_STORAGE_KEY = 'lm:add-nightlife:draft:v1';
const NIGHTLIFE_SECTION_ORDER: NightlifeFormSection[] = [
  'step1',
  'entities',
  'core',
  'space',
  'scene',
  'contact',
];

const STEP1_FIELDS: Array<keyof AddNightlifeFormData> = ['name', 'location'];
const ENTITIES_FIELDS: Array<keyof AddNightlifeFormData> = ['googleUrl', 'placeId', 'latitude', 'longitude'];
const CORE_FIELDS: Array<keyof AddNightlifeFormData> = ['clubType', 'music', 'idealFor'];
const SPACE_FIELDS: Array<keyof AddNightlifeFormData> = ['priceTier', 'venueType', 'venueSize', 'spaceLayout', 'vibe', 'peakHours'];
const SCENE_FIELDS: Array<keyof AddNightlifeFormData> = [
  'musicFormat',
  'touristPresence',
  'energyLevel',
  'vipAndBottleService',
  'crowdProfile',
  'dressCode',
];
const CONTACT_FIELDS: Array<keyof AddNightlifeFormData> = [
  'countryCode',
  'phone',
  'website',
  'reserveUrl',
  'daytimeRestaurant',
];

const NIGHTLIFE_FORM_DEFAULT_VALUES: AddNightlifeFormData = {
  name: '',
  idealFor: [],
  priceTier: '$$$',
  clubType: 'Cocktail Bar',
  music: ['House', 'EDM'],
  venueType: 'Bar',
  venueSize: 'Large',
  spaceLayout: ['Indoor', 'Rooftop'],
  vibe: ['Upscale', 'Exclusive', 'High-Energy'],
  peakHours: '1:00 AM - 3:30 AM',
  touristPresence: 'Low',
  musicFormat: ['Open Format'],
  dressCode: ['Upscale', 'Dress to Impress'],
  energyLevel: 'High',
  vipAndBottleService: 'Yes',
  crowdProfile: '20-40',
  countryCode: 'PE',
  location: '',
  phone: '',
  hours: '',
  website: '',
  reserveUrl: '',
  district: '',
  locationKey: '',
  ianaTimeId: '',
  placeId: '',
  googleUrl: '',
  latitude: '',
  longitude: '',
  daytimeRestaurant: '0',
};

interface NightlifeDraftPayload {
  formValues: AddNightlifeFormData;
  prefillSignature: string | null;
}

function isDraftEffectivelyEmpty(payload: NightlifeDraftPayload) {
  if (payload.prefillSignature !== null) return false;
  return JSON.stringify(payload.formValues) === JSON.stringify(NIGHTLIFE_FORM_DEFAULT_VALUES);
}

function readNightlifeDraftFromStorage(): NightlifeDraftPayload | null {
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(NIGHTLIFE_DRAFT_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<NightlifeDraftPayload>;
    const parsedValues = addNightlifeSchema.partial().safeParse(parsed.formValues);
    if (!parsedValues.success) {
      clearNightlifeDraftFromStorage();
      return null;
    }

    const prefillSignature =
      typeof parsed.prefillSignature === 'string' ? parsed.prefillSignature : null;

    return {
      formValues: {
        ...NIGHTLIFE_FORM_DEFAULT_VALUES,
        ...(parsedValues.data as Partial<AddNightlifeFormData>),
      },
      prefillSignature,
    };
  } catch {
    clearNightlifeDraftFromStorage();
    return null;
  }
}

function writeNightlifeDraftToStorage(payload: NightlifeDraftPayload) {
  if (typeof window === 'undefined') return;

  try {
    if (isDraftEffectivelyEmpty(payload)) {
      window.localStorage.removeItem(NIGHTLIFE_DRAFT_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(NIGHTLIFE_DRAFT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage write failures (quota/private browsing/etc).
  }
}

function clearNightlifeDraftFromStorage() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(NIGHTLIFE_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore storage deletion failures.
  }
}

function getSectionFields(section: NightlifeFormSection): Array<keyof AddNightlifeFormData> {
  switch (section) {
    case 'step1':
      return STEP1_FIELDS;
    case 'entities':
      return ENTITIES_FIELDS;
    case 'core':
      return CORE_FIELDS;
    case 'space':
      return SPACE_FIELDS;
    case 'scene':
      return SCENE_FIELDS;
    case 'contact':
      return CONTACT_FIELDS;
    default:
      return [];
  }
}

function findFirstErrorSection(
  errors: FieldErrors<AddNightlifeFormData>
): NightlifeFormSection | null {
  for (const section of NIGHTLIFE_SECTION_ORDER) {
    const sectionHasError = getSectionFields(section).some((fieldName) => Boolean(errors[fieldName]));
    if (sectionHasError) {
      return section;
    }
  }

  return null;
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
              <th className="text-left px-2 py-1.5 font-medium">Option Label</th>
              <th className="text-left px-2 py-1.5 font-medium">What This Means</th>
            </tr>
          </thead>
          <tbody>
            {options.map((option) => (
              <tr key={option.value} className={value === option.value ? 'bg-primary/10' : 'border-t border-border'}>
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
              <th className="text-left px-2 py-1.5 font-medium w-44">Option Label</th>
              <th className="text-left px-2 py-1.5 font-medium">What This Means</th>
            </tr>
          </thead>
          <tbody>
            {options.map((option) => {
              const isChecked = values.includes(option.value);
              return (
                <tr key={option.value} className={isChecked ? 'bg-primary/10 border-t border-border' : 'border-t border-border'}>
                  <td className="px-2 py-1.5">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggle(option.value)}
                      />
                      <span className="text-[11px]">{isChecked ? 'Selected' : 'Select'}</span>
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

function SectionHeader({ title, isComplete = false, helperText }: SectionHeaderProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        {isComplete && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Complete
          </span>
        )}
      </div>
      {helperText ? (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      ) : null}
    </div>
  );
}

export function AddNightlifeLocation() {
  const [activeSection, setActiveSection] = useState<NightlifeFormSection>('step1');
  const [isPrefillingGoogle, setIsPrefillingGoogle] = useState(false);
  const [operationHoursModalOpen, setOperationHoursModalOpen] = useState(false);
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [prefillSignature, setPrefillSignature] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState<string | null>(null);
  const hasHydratedDraftRef = useRef(false);

  const form = useForm<AddNightlifeFormData>({
    resolver: zodResolver(addNightlifeSchema),
    defaultValues: NIGHTLIFE_FORM_DEFAULT_VALUES,
    mode: 'onChange',
  });

  const { mutate: createLocation, isPending, error } = useCreateLocation();

  useEffect(() => {
    const draft = readNightlifeDraftFromStorage();
    if (!draft) {
      hasHydratedDraftRef.current = true;
      return;
    }

    form.reset(draft.formValues);
    setPrefillSignature(draft.prefillSignature);
    setPrefillMessage('Restored unsaved draft from your previous session.');
    setPrefillError(null);
    hasHydratedDraftRef.current = true;
  }, [form]);

  useEffect(() => {
    const subscription = form.watch((value) => {
      if (!hasHydratedDraftRef.current) return;

      writeNightlifeDraftToStorage({
        formValues: {
          ...NIGHTLIFE_FORM_DEFAULT_VALUES,
          ...(value as Partial<AddNightlifeFormData>),
        },
        prefillSignature,
      });
    });

    return () => subscription.unsubscribe();
  }, [form, prefillSignature]);

  useEffect(() => {
    if (!hasHydratedDraftRef.current) return;

    writeNightlifeDraftToStorage({
      formValues: form.getValues(),
      prefillSignature,
    });
  }, [form, prefillSignature]);

  const currentPrefillSignature = buildPrefillSignature(
    form.watch('name'),
    form.watch('location')
  );
  const isPrefillReady = prefillSignature !== null && prefillSignature === currentPrefillSignature;
  const prefillIsStale = prefillSignature !== null && !isPrefillReady;
  const hasValue = (value: string | undefined) => Boolean(value && value.trim().length > 0);
  const idealForOptionGroups = getIdealForOptionGroups('nightlife');

  const stepOneComplete = isPrefillReady;
  const entitiesComplete = isPrefillReady;
  const coreComplete =
    Boolean(form.watch('clubType')) &&
    (form.watch('music')?.length ?? 0) > 0 &&
    (form.watch('idealFor')?.length ?? 0) > 0;
  const spaceComplete =
    Boolean(form.watch('priceTier')) &&
    Boolean(form.watch('venueType')) &&
    Boolean(form.watch('venueSize')) &&
    (form.watch('spaceLayout')?.length ?? 0) > 0 &&
    (form.watch('vibe')?.length ?? 0) > 0 &&
    Boolean(form.watch('peakHours'));
  const sceneComplete =
    (form.watch('musicFormat')?.length ?? 0) > 0 &&
    Boolean(form.watch('touristPresence')) &&
    Boolean(form.watch('energyLevel')) &&
    Boolean(form.watch('vipAndBottleService')) &&
    Boolean(form.watch('crowdProfile')) &&
    (form.watch('dressCode')?.length ?? 0) > 0;
  const contactComplete =
    Boolean(form.watch('countryCode')) &&
    hasValue(form.watch('phone')) &&
    hasValue(form.watch('website')) &&
    !form.formState.errors.phone &&
    !form.formState.errors.website;

  const canOpenSection = (section: NightlifeFormSection) => {
    if (section === 'step1') return true;
    return isPrefillReady;
  };

  const goToSection = (section: NightlifeFormSection) => {
    if (!canOpenSection(section)) return;
    setActiveSection(section);
  };

  const goToNextSection = async () => {
    const currentIndex = NIGHTLIFE_SECTION_ORDER.indexOf(activeSection);
    const nextSection = NIGHTLIFE_SECTION_ORDER[currentIndex + 1];
    if (!nextSection) return;

    const currentSectionFields = getSectionFields(activeSection);
    if (currentSectionFields.length > 0) {
      const isValid = await form.trigger(currentSectionFields, { shouldFocus: true });
      if (!isValid) {
        return;
      }
    }

    goToSection(nextSection);
  };

  const goToPreviousSection = () => {
    const currentIndex = NIGHTLIFE_SECTION_ORDER.indexOf(activeSection);
    const previousSection = NIGHTLIFE_SECTION_ORDER[currentIndex - 1];
    if (previousSection) {
      goToSection(previousSection);
    }
  };

  const flowSections: Array<{ key: NightlifeFormSection; label: string; complete: boolean }> = [
    { key: 'step1', label: 'Step 1', complete: stepOneComplete },
    { key: 'entities', label: 'Entities', complete: entitiesComplete },
    { key: 'core', label: 'Core', complete: coreComplete },
    { key: 'space', label: 'Space', complete: spaceComplete },
    { key: 'scene', label: 'Scene', complete: sceneComplete },
    { key: 'contact', label: 'Contact', complete: contactComplete },
  ];

  useEffect(() => {
    if (!isPrefillReady && activeSection !== 'step1') {
      setActiveSection('step1');
    }
  }, [isPrefillReady, activeSection]);

  const toggleMultiOption = (field: MultiField, value: string) => {
    const currentValues = (form.getValues(field) || []) as string[];
    const nextValues = currentValues.includes(value)
      ? currentValues.filter((item) => item !== value)
      : [...currentValues, value];

    form.setValue(field, nextValues as AddNightlifeFormData[MultiField], {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });
  };

  const handleGooglePrefill = async () => {
    setPrefillError(null);
    setPrefillMessage(null);

    const isStepValid = await form.trigger(['name', 'location']);
    if (!isStepValid) {
      setPrefillSignature(null);
      setPrefillError('Enter a valid name and address before running Google lookup.');
      return;
    }

    const name = form.getValues('name').trim();
    const normalizedAddress = normalizeAddress(form.getValues('location'));
    form.setValue('location', normalizedAddress, {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });

    setIsPrefillingGoogle(true);

    try {
      const prefill = await locationsApi.googlePrefill('nightlife', {
        name,
        address: normalizedAddress,
      });

      form.setValue('placeId', prefill.placeId, {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      form.setValue('latitude', String(prefill.lat), {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      form.setValue('longitude', String(prefill.lng), {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      form.setValue('googleUrl', prefill.googleUrl, {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      form.setValue('locationKey', prefill.locationKey || '', {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      form.setValue('district', prefill.district || '', {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      form.setValue('ianaTimeId', prefill.ianaTimeId || '', {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
      if (prefill.phoneNumber) {
        form.setValue('phone', prefill.phoneNumber, {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: true,
        });
      }
      if (prefill.website) {
        form.setValue('website', prefill.website, {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: true,
        });
      }
      if (prefill.operationHours) {
        form.setValue('hours', JSON.stringify(prefill.operationHours, null, 2), {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: true,
        });
      }

      setPrefillSignature(buildPrefillSignature(name, normalizedAddress));
      setPrefillMessage(
        'Google lookup complete. Place ID, coordinates, location key, district, time zone, phone, website, and hours were prefilled when available.'
      );
      setActiveSection('entities');
    } catch (lookupError) {
      setPrefillSignature(null);
      setPrefillError(getErrorMessage(lookupError));
    } finally {
      setIsPrefillingGoogle(false);
    }
  };

  const onSubmit = (data: AddNightlifeFormData) => {
    if (!isPrefillReady) {
      setPrefillError('Run Name + Address Google lookup before creating the nightlife document.');
      return;
    }

    const normalizedAddress = normalizeAddress(data.location);
    const latValue = data.latitude?.trim() ? Number(data.latitude) : undefined;
    const lngValue = data.longitude?.trim() ? Number(data.longitude) : undefined;
    const music = data.music;
    const spaceLayout = data.spaceLayout;
    const vibe = data.vibe;
    const musicFormat = data.musicFormat;
    const dressCode = data.dressCode;
    const operationHoursValue = (data.hours ?? '').trim();
    const hasStructuredHours = isOperationHoursJson(operationHoursValue);
    const nightlifeHours = hasStructuredHours
      ? buildOperationHoursSummary(operationHoursValue)
      : operationHoursValue;

    const nightlifeDetails = {
      name: data.name,
      price_tier: data.priceTier,
      club_type: data.clubType,
      music,
      details: {
        theSpace: {
          venueType: { label: 'Venue Type', value: data.venueType },
          venueSize: { label: 'Venue Size', value: data.venueSize },
          spaceLayout: { label: 'Layout', value: spaceLayout },
          vibe: { label: 'Vibe', value: vibe },
          peakHours: { label: 'Peak Hours', value: data.peakHours },
        },
        theScene: {
          musicFormat: { label: 'Music', value: musicFormat },
          touristPresence: { label: 'Tourist Presence', value: data.touristPresence },
          dressCode: { label: 'Dress Code', value: dressCode },
          energyLevel: { label: 'Energy Level', value: data.energyLevel },
          vipAndBottleService: { label: 'VIP & Bottle Service', value: data.vipAndBottleService },
          crowdProfile: { label: 'Age Range', value: data.crowdProfile },
        },
      },
      location: normalizedAddress,
      phone: data.phone || '',
      hours: nightlifeHours,
      website: data.website || '',
      reserve_url: data.reserveUrl || '',
      daytime_restaurant: Number(data.daytimeRestaurant),
    };

    createLocation(
      {
        name: data.name,
        title: data.name,
        address: normalizedAddress,
        category: 'nightlife',
        idealFor: data.idealFor,
        type: data.clubType,
        countryCode: data.countryCode,
        phoneNumber: data.phone || undefined,
        website: data.website || undefined,
        district: data.district || undefined,
        locationKey: data.locationKey || undefined,
        ianaTimeId: data.ianaTimeId || undefined,
        placeId: data.placeId || undefined,
        url: data.googleUrl || undefined,
        lat: Number.isFinite(latValue) ? latValue : undefined,
        lng: Number.isFinite(lngValue) ? lngValue : undefined,
        operationHours: hasStructuredHours ? operationHoursValue : undefined,
        nightlifeDetails,
      },
      {
        onSuccess: (response) => {
          setCreatedName(response.title || response.source.name);
          form.reset();
          setOperationHoursModalOpen(false);
          setPrefillSignature(null);
          setPrefillMessage(null);
          setPrefillError(null);
          setActiveSection('step1');
          clearNightlifeDraftFromStorage();
        },
      }
    );
  };

  const onInvalidSubmit = (errors: FieldErrors<AddNightlifeFormData>) => {
    const firstErrorSection = findFirstErrorSection(errors);
    if (firstErrorSection && firstErrorSection !== activeSection) {
      setActiveSection(firstErrorSection);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-6xl rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Music2 className="w-4 h-4 text-muted-foreground" />
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground underline">
                  Add Nightlife
                </h1>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                asChild
                className="h-9 border-border/80 bg-background/60 px-3 text-foreground hover:bg-accent/70"
              >
                <Link to="/add">
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Link>
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {flowSections.map((section, index) => {
                const isActive = activeSection === section.key;
                const isDisabled = !canOpenSection(section.key);
                return (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => goToSection(section.key)}
                    disabled={isDisabled}
                    className={`inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                      isActive
                        ? 'border-border bg-muted text-foreground'
                        : isDisabled
                          ? 'cursor-not-allowed border-border/50 bg-background text-muted-foreground/55'
                          : 'border-border/60 bg-background text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground'
                    }`}
                  >
                    <span>{index + 1}.</span>
                    <span>{section.label}</span>
                    {section.complete && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                  </button>
                );
              })}
            </div>
          </div>

          {createdName && (
            <div className="mb-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
              Created nightlife document: {createdName}
              <p className="mt-1 text-xs text-emerald-300">
                Add media from Home after opening this document.
              </p>
            </div>
          )}

          <form onSubmit={form.handleSubmit(onSubmit, onInvalidSubmit)} className="space-y-5">
          {activeSection === 'step1' && (
          <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
            <SectionHeader
              title="Step 1"
              isComplete={stepOneComplete}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input placeholder="Location Name" {...form.register('name')} />
                {form.formState.errors.name && (
                  <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input placeholder="Location Address" {...form.register('location')} />
                {form.formState.errors.location && (
                  <p className="text-xs text-destructive">{form.formState.errors.location.message}</p>
                )}
              </div>
            </div>

            <div className="flex justify-end border-t border-border/70 pt-4">
              <Button
                type="button"
                onClick={() => void handleGooglePrefill()}
                disabled={isPrefillingGoogle || isPending}
              >
                {isPrefillingGoogle ? 'Continuing...' : 'Continue'}
              </Button>
            </div>

            {prefillMessage && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
                {prefillMessage}
              </div>
            )}

            {prefillError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {prefillError}
              </div>
            )}

            {prefillIsStale && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-400">
                Name or address changed after lookup. Run Google lookup again to refresh Place ID and coordinates.
              </div>
            )}

          </section>
          )}

          {isPrefillReady && activeSection === 'entities' && (
          <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
            <SectionHeader
              title="Entities Fields (Optional Manual Overrides)"
              isComplete={entitiesComplete}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Google URL</Label>
                <Input placeholder="https://www.google.com/maps/..." {...form.register('googleUrl')} />
                {form.formState.errors.googleUrl && (
                  <p className="text-xs text-destructive">{form.formState.errors.googleUrl.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Place ID</Label>
                <Input placeholder="ChIJ..." {...form.register('placeId')} />
                {form.formState.errors.placeId && (
                  <p className="text-xs text-destructive">{form.formState.errors.placeId.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Latitude</Label>
                <Input placeholder="-12.0464" {...form.register('latitude')} />
                {form.formState.errors.latitude && (
                  <p className="text-xs text-destructive">{form.formState.errors.latitude.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Longitude</Label>
                <Input placeholder="-77.0428" {...form.register('longitude')} />
                {form.formState.errors.longitude && (
                  <p className="text-xs text-destructive">{form.formState.errors.longitude.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Time Zone (IANA)</Label>
                <Input placeholder="America/Lima" {...form.register('ianaTimeId')} />
                {form.formState.errors.ianaTimeId && (
                  <p className="text-xs text-destructive">{form.formState.errors.ianaTimeId.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>District</Label>
                <Input placeholder="Miraflores" {...form.register('district')} />
                {form.formState.errors.district && (
                  <p className="text-xs text-destructive">{form.formState.errors.district.message}</p>
                )}
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Location Key</Label>
                <Input placeholder="peru|lima|miraflores" {...form.register('locationKey')} />
                {form.formState.errors.locationKey && (
                  <p className="text-xs text-destructive">{form.formState.errors.locationKey.message}</p>
                )}
              </div>
            </div>

            <div className="flex justify-between border-t border-border/70 pt-4">
              <Button type="button" variant="outline" onClick={goToPreviousSection}>
                Previous
              </Button>
              <Button type="button" onClick={() => void goToNextSection()}>
                Next
              </Button>
            </div>
          </section>
          )}

          {isPrefillReady && activeSection === 'core' && (
          <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
            <SectionHeader
              title="Core Identity"
              isComplete={coreComplete}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <OptionSelect
                label="Venue Category"
                options={CLUB_TYPE_OPTIONS}
                value={form.watch('clubType')}
                onChange={(value) => form.setValue('clubType', value as AddNightlifeFormData['clubType'], { shouldValidate: true })}
                error={form.formState.errors.clubType?.message}
              />
            </div>

            <MultiOptionTable
              label="Primary Music Genres"
              options={MUSIC_OPTIONS}
              values={form.watch('music')}
              onToggle={(value) => toggleMultiOption('music', value)}
              error={form.formState.errors.music?.message as string | undefined}
            />

            <FormTagMultiSelect
              name="idealFor"
              label="Ideal For"
              control={form.control}
              optionGroups={idealForOptionGroups}
              maxSelections={4}
              description="Choose 1 to 4 tags"
              allowDirectTagArrayInput
            />

            <div className="flex justify-between border-t border-border/70 pt-4">
              <Button type="button" variant="outline" onClick={goToPreviousSection}>
                Previous
              </Button>
              <Button type="button" onClick={() => void goToNextSection()}>
                Next
              </Button>
            </div>
          </section>
          )}

          {isPrefillReady && activeSection === 'space' && (
          <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
            <SectionHeader
              title="The Space"
              isComplete={spaceComplete}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <OptionSelect
                label="Price Tier (Spend Level)"
                options={PRICE_TIER_OPTIONS}
                value={form.watch('priceTier')}
                onChange={(value) => form.setValue('priceTier', value as AddNightlifeFormData['priceTier'], { shouldValidate: true })}
                error={form.formState.errors.priceTier?.message}
              />
              <OptionSelect
                label="Space Type"
                options={VENUE_TYPE_OPTIONS}
                value={form.watch('venueType')}
                onChange={(value) => form.setValue('venueType', value as AddNightlifeFormData['venueType'], { shouldValidate: true })}
                error={form.formState.errors.venueType?.message}
              />
              <OptionSelect
                label="Venue Capacity"
                options={VENUE_SIZE_OPTIONS}
                value={form.watch('venueSize')}
                onChange={(value) => form.setValue('venueSize', value as AddNightlifeFormData['venueSize'], { shouldValidate: true })}
                error={form.formState.errors.venueSize?.message}
              />
            </div>

            <MultiOptionTable
              label="Layout & Zones"
              options={SPACE_LAYOUT_OPTIONS}
              values={form.watch('spaceLayout')}
              onToggle={(value) => toggleMultiOption('spaceLayout', value)}
              error={form.formState.errors.spaceLayout?.message as string | undefined}
            />

            <MultiOptionTable
              label="Atmosphere / Vibe"
              options={VIBE_OPTIONS}
              values={form.watch('vibe')}
              onToggle={(value) => toggleMultiOption('vibe', value)}
              error={form.formState.errors.vibe?.message as string | undefined}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <OptionSelect
                label="Peak Hours (Busiest Window)"
                options={PEAK_HOURS_OPTIONS}
                value={form.watch('peakHours')}
                onChange={(value) => form.setValue('peakHours', value as AddNightlifeFormData['peakHours'], { shouldValidate: true })}
                error={form.formState.errors.peakHours?.message}
              />
            </div>

            <div className="flex justify-between border-t border-border/70 pt-4">
              <Button type="button" variant="outline" onClick={goToPreviousSection}>
                Previous
              </Button>
              <Button type="button" onClick={() => void goToNextSection()}>
                Next
              </Button>
            </div>
          </section>
          )}

          {isPrefillReady && activeSection === 'scene' && (
          <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
            <SectionHeader
              title="The Scene"
              isComplete={sceneComplete}
            />
            <MultiOptionTable
              label="DJ / Music Format"
              options={MUSIC_FORMAT_OPTIONS}
              values={form.watch('musicFormat')}
              onToggle={(value) => toggleMultiOption('musicFormat', value)}
              error={form.formState.errors.musicFormat?.message as string | undefined}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <OptionSelect
                label="Tourist vs Local Mix"
                options={TOURIST_PRESENCE_OPTIONS}
                value={form.watch('touristPresence')}
                onChange={(value) => form.setValue('touristPresence', value as AddNightlifeFormData['touristPresence'], { shouldValidate: true })}
                error={form.formState.errors.touristPresence?.message}
              />
              <OptionSelect
                label="Energy Level"
                options={ENERGY_LEVEL_OPTIONS}
                value={form.watch('energyLevel')}
                onChange={(value) => form.setValue('energyLevel', value as AddNightlifeFormData['energyLevel'], { shouldValidate: true })}
                error={form.formState.errors.energyLevel?.message}
              />
              <OptionSelect
                label="VIP / Bottle Service Availability"
                options={VIP_BOTTLE_SERVICE_OPTIONS}
                value={form.watch('vipAndBottleService')}
                onChange={(value) => form.setValue('vipAndBottleService', value as AddNightlifeFormData['vipAndBottleService'], { shouldValidate: true })}
                error={form.formState.errors.vipAndBottleService?.message}
              />
              <OptionSelect
                label="Crowd Profile (Age Range)"
                options={CROWD_PROFILE_OPTIONS}
                value={form.watch('crowdProfile')}
                onChange={(value) => form.setValue('crowdProfile', value as AddNightlifeFormData['crowdProfile'], { shouldValidate: true })}
                error={form.formState.errors.crowdProfile?.message}
              />
            </div>

            <MultiOptionTable
              label="Expected Dress Code"
              options={DRESS_CODE_OPTIONS}
              values={form.watch('dressCode')}
              onToggle={(value) => toggleMultiOption('dressCode', value)}
              error={form.formState.errors.dressCode?.message as string | undefined}
            />

            <div className="flex justify-between border-t border-border/70 pt-4">
              <Button type="button" variant="outline" onClick={goToPreviousSection}>
                Previous
              </Button>
              <Button type="button" onClick={() => void goToNextSection()}>
                Next
              </Button>
            </div>
          </section>
          )}

          {isPrefillReady && activeSection === 'contact' && (
          <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
            <SectionHeader
              title="Contact & Access"
              isComplete={contactComplete}
            />
            <div className="space-y-2 max-w-xs">
              <Label>Country (Phone Region)</Label>
              <select
                value={form.watch('countryCode')}
                onChange={(event) =>
                  form.setValue('countryCode', event.target.value as AddNightlifeFormData['countryCode'], {
                    shouldValidate: true,
                  })
                }
                className="w-full h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground"
              >
                <option value="PE">Peru (PE)</option>
                <option value="CO">Colombia (CO)</option>
                <option value="BR">Brazil (BR)</option>
              </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone Number (Public)</Label>
                <Input placeholder="+1 (555) 234-5678" {...form.register('phone')} />
                {form.formState.errors.phone && (
                  <p className="text-xs text-destructive">{form.formState.errors.phone.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Operating Hours</Label>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => setOperationHoursModalOpen(true)}
                  >
                    <Clock className="h-4 w-4" />
                    {form.watch('hours') ? 'Edit schedule' : 'Set schedule'}
                  </Button>
                  {form.watch('hours') && (
                    <span className="text-xs text-muted-foreground">
                      Schedule configured - open modal to edit
                    </span>
                  )}
                </div>
                {operationHoursModalOpen && (
                  <OperationHoursModal
                    open={operationHoursModalOpen}
                    onOpenChange={setOperationHoursModalOpen}
                    value={form.watch('hours') ?? ''}
                    onSave={(json) => {
                      form.setValue('hours', json, {
                        shouldDirty: true,
                        shouldValidate: true,
                        shouldTouch: true,
                      });
                    }}
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label>Official Website</Label>
                <Input placeholder="https://example.com/nebula" {...form.register('website')} />
                {form.formState.errors.website && (
                  <p className="text-xs text-destructive">{form.formState.errors.website.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Reservations URL</Label>
                <Input placeholder="https://example.com/nebula/reserve" {...form.register('reserveUrl')} />
                {form.formState.errors.reserveUrl && (
                  <p className="text-xs text-destructive">{form.formState.errors.reserveUrl.message}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Daytime Restaurant Service</Label>
              <select
                value={form.watch('daytimeRestaurant')}
                onChange={(event) => form.setValue('daytimeRestaurant', event.target.value as AddNightlifeFormData['daytimeRestaurant'], { shouldValidate: true })}
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
                      <th className="text-left px-2 py-1.5 font-medium">Option Label</th>
                      <th className="text-left px-2 py-1.5 font-medium">What This Means</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DAYTIME_RESTAURANT_OPTIONS.map((option) => (
                      <tr key={option.value} className={form.watch('daytimeRestaurant') === option.value ? 'bg-primary/10 border-t border-border' : 'border-t border-border'}>
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

            <div className="flex justify-between border-t border-border/70 pt-4">
              <Button type="button" variant="outline" onClick={goToPreviousSection}>
                Previous
              </Button>
              <Button type="submit" disabled={!isPrefillReady || !form.formState.isValid || isPending}>
                {isPending ? 'Creating...' : 'Create Nightlife Document'}
              </Button>
            </div>
          </section>
          )}

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              Error: {error.message}
            </div>
          )}

          </form>
        </div>
      </div>
    </div>
  );
}
