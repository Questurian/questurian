// Pages - Discovery Flow Only (How to get to the city)
export { CitySelectionPage } from './pages/CitySelectionPage';
export { IntentSelectionPage } from './pages/IntentSelectionPage';
export { ConfirmationPage } from './pages/ConfirmationPage';

// Components
export { CityCard } from './components/CityCard';
export { IntentCard } from './components/IntentCard';

// Data & Utils
export { cities, intents, getCityBySlug, getCityById, getIntentById } from './lib/data';

// Types
export type { City, Intent } from './types';
