export interface DiningTypeOption {
  label: string;
  value: string;
}

export interface DiningTypeOptionGroup {
  label: string;
  options: readonly DiningTypeOption[];
}

export interface DiningCuisineOptionGroup {
  label: string;
  options: readonly string[];
}

export const DINING_ESTABLISHMENT_TYPE_GROUPS: readonly DiningTypeOptionGroup[] = [
  {
    label: "Core Restaurant Formats",
    options: [
      { label: "Restaurant", value: "restaurant" },
      { label: "Hotel Restaurant", value: "hotel-restaurant" },
      { label: "Chef's Table", value: "chefs-table" },
      { label: "Family Restaurant", value: "family-restaurant" },
      { label: "Fine Dining Restaurant", value: "fine-dining-restaurant" },
      { label: "Buffet Restaurant", value: "buffet-restaurant" },
      { label: "Bistro", value: "bistro" },
      { label: "Brasserie", value: "brasserie" },
    ],
  },
  {
    label: "Cafes & Dessert Spots",
    options: [
      { label: "Café", value: "cafe" },
      { label: "Coffee Shop", value: "coffee-shop" },
      { label: "Tea House", value: "tea-house" },
      { label: "Juice Bar", value: "juice-bar" },
      { label: "Bakery", value: "bakery" },
      {
        label: "Dessert Restaurant / Dessert Shop",
        value: "dessert-shop",
      },
      { label: "Ice Cream Shop", value: "ice-cream-shop" },
    ],
  },
  {
    label: "Quick Service & Street",
    options: [
      { label: "Deli", value: "deli" },
      { label: "Snack Bar", value: "snack-bar" },
      { label: "Fast Food Restaurant", value: "fast-food-restaurant" },
      { label: "Food Court", value: "food-court-stall" },
      { label: "Market Stall", value: "market-stall" },
      { label: "Street Stall", value: "street-stall" },
      { label: "Kiosk", value: "kiosk" },
      { label: "Food Truck", value: "food-truck" },
    ],
  },
  {
    label: "Bars & Drink-Led Venues",
    options: [
      { label: "Bar & Grill", value: "bar-and-grill" },
      { label: "Gastropub", value: "gastropub" },
      { label: "Pub", value: "pub" },
      { label: "Tavern", value: "tavern" },
      { label: "Taproom", value: "taproom" },
      { label: "Beer Hall", value: "beer-hall" },
      { label: "Brewpub", value: "brewpub" },
      { label: "Wine Bar", value: "wine-bar" },
      { label: "Cocktail Bar", value: "cocktail-bar" },
      { label: "Sports Bar", value: "sports-bar" },
      { label: "Rooftop Bar", value: "rooftop-bar" },
      { label: "Lounge", value: "lounge" },
    ],
  },
  {
    label: "Global Specialty Houses",
    options: [
      { label: "Steak House", value: "steakhouse" },
      { label: "Seafood Restaurant", value: "seafood-restaurant" },
      { label: "Grill", value: "grill-house" },
      { label: "Barbecue Restaurant", value: "bbq-restaurant" },
      { label: "Pizza Restaurant", value: "pizzeria" },
      { label: "Sushi Restaurant", value: "sushi-bar" },
      { label: "Ramen Restaurant", value: "ramen-shop" },
      { label: "Noodle Shop", value: "noodle-house" },
      { label: "Hamburger Restaurant", value: "burger-joint" },
      { label: "Sandwich Shop", value: "sandwich-shop" },
      { label: "Brunch Restaurant", value: "brunch-spot" },
      { label: "Breakfast Restaurant", value: "breakfast-restaurant" },
      {
        label: "Chicken Restaurant (rotisserie)",
        value: "rotisserie-house",
      },
    ],
  },
  {
    label: "Peruvian Subtypes",
    options: [
      { label: "Peruvian Restaurant", value: "peruvian-restaurant" },
      { label: "Peruvian Cevicheria", value: "peruvian-cevicheria" },
      {
        label: "Peruvian Polleria (rotisserie chicken restaurant)",
        value: "peruvian-polleria",
      },
      { label: "Peruvian Chifa Restaurant", value: "peruvian-chifa-house" },
      { label: "Peruvian Nikkei Restaurant", value: "peruvian-nikkei-house" },
      { label: "Peruvian Picanteria", value: "peruvian-picanteria" },
      { label: "Peruvian Sangucheria", value: "peruvian-sangucheria" },
    ],
  },
  {
    label: "Colombian Subtypes",
    options: [
      { label: "Colombian Restaurant", value: "colombian-restaurant" },
      { label: "Colombian Asadero (grill)", value: "colombian-asadero" },
      {
        label: "Colombian Areperia (arepa restaurant)",
        value: "colombian-areperia",
      },
      {
        label: "Colombian Corrientazo Restaurant",
        value: "colombian-corrientazo-house",
      },
      {
        label: "Colombian Parrilla Restaurant",
        value: "colombian-parrilla-house",
      },
    ],
  },
  {
    label: "Brazilian Subtypes",
    options: [
      { label: "Brazilian Restaurant", value: "brazilian-restaurant" },
      { label: "Brazilian Churrascaria", value: "brazilian-churrascaria" },
      {
        label: "Brazilian Rodizio Restaurant",
        value: "brazilian-rodizio-house",
      },
      { label: "Brazilian Boteco (bar)", value: "brazilian-boteco" },
      {
        label: "Brazilian Lanchonete (snack bar)",
        value: "brazilian-lanchonete",
      },
    ],
  },
  {
    label: "Mexican Subtypes",
    options: [
      { label: "Mexican Restaurant", value: "mexican-restaurant" },
      { label: "Mexican Taqueria", value: "mexican-taqueria" },
      { label: "Mexican Cantina", value: "mexican-cantina" },
      { label: "Mexican Antojería", value: "mexican-antojeria" },
      {
        label: "Mexican Marisquería (seafood restaurant)",
        value: "mexican-marisqueria",
      },
    ],
  },
  {
    label: "Chilean Subtypes",
    options: [
      { label: "Chilean Restaurant", value: "chilean-restaurant" },
      { label: "Chilean Fuente de Soda", value: "chilean-fuente-de-soda" },
      { label: "Chilean Marisquería", value: "chilean-marisqueria" },
      { label: "Chilean Picantería", value: "chilean-picanteria" },
    ],
  },
  {
    label: "Argentinian Subtypes",
    options: [
      { label: "Argentinian Restaurant", value: "argentinian-restaurant" },
      {
        label: "Argentinian Parrilla Restaurant",
        value: "argentinian-parrilla-house",
      },
      { label: "Argentinian Bodegón", value: "argentinian-bodegon" },
      {
        label: "Argentinian Asado Restaurant",
        value: "argentinian-asado-house",
      },
    ],
  },
];

export const DINING_ESTABLISHMENT_TYPES: readonly DiningTypeOption[] =
  DINING_ESTABLISHMENT_TYPE_GROUPS.flatMap((group) => group.options);

export const DINING_CUISINE_OPTION_GROUPS: readonly DiningCuisineOptionGroup[] = [
  {
    label: "Latin America & Caribbean",
    options: [
      "Peruvian",
      "Mexican",
      "Colombian",
      "Brazilian",
      "Argentinian",
      "Chilean",
      "Venezuelan",
      "Ecuadorian",
      "Bolivian",
      "Uruguayan",
      "Paraguayan",
      "Cuban",
      "Dominican",
      "Puerto Rican",
      "Salvadoran",
      "Guatemalan",
      "Nicaraguan",
      "Honduran",
      "Panamanian",
      "Costa Rican",
      "Caribbean",
      "Latin Fusion",
    ],
  },
  {
    label: "World Cuisines",
    options: [
      "Spanish",
      "Portuguese",
      "Italian",
      "French",
      "Mediterranean",
      "Greek",
      "Turkish",
      "Middle Eastern",
      "Lebanese",
      "Indian",
      "Japanese",
      "Chinese",
      "Thai",
      "Vietnamese",
      "Korean",
      "American",
    ],
  },
  {
    label: "Cuisine Families",
    options: [
      "South American",
      "Central American",
      "Asian",
      "European",
      "Fusion",
      "Contemporary",
    ],
  },
  {
    label: "Latin Specialties",
    options: [
      "Nikkei",
      "Chifa",
      "Criolla",
      "Andean",
      "Amazonian",
      "Ceviche",
      "Tiradito",
      "Lomo Saltado",
      "Pollo a la Brasa",
      "Anticuchos",
      "Causa",
      "Empanadas",
      "Arepas",
      "Asado",
      "Parrilla",
      "Tacos",
      "Burritos",
      "Quesadillas",
      "Tamales",
    ],
  },
  {
    label: "Dish & Style",
    options: [
      "Wings",
      "Ramen",
      "Sushi",
      "Sashimi",
      "Tempura",
      "Udon",
      "Pho",
      "Noodles",
      "Dumplings",
      "Dim Sum",
      "Hot Pot",
      "Burgers",
      "Pizza",
      "Pasta",
      "Steak",
      "BBQ",
      "Grill",
      "Rotisserie Chicken",
      "Sandwiches",
      "Tacos & Street Tacos",
      "Poke",
      "Tapas",
      "Paella",
      "Kebab",
      "Shawarma",
      "Falafel",
      "Curry",
      "Biryani",
      "Seafood",
    ],
  },
  {
    label: "Soups",
    options: [
      "Soups",
      "Peruvian Soup",
      "Caldo de Gallina",
      "Sopa Criolla",
      "Parihuela",
    ],
  },
  {
    label: "Dietary & Food Styles",
    options: [
      "Vegan",
      "Vegetarian",
      "Gluten-Free",
      "Healthy",
      "Street Food",
      "Coffee & Tea",
      "Desserts",
      "Ice Cream",
      "Brunch",
      "Pub Food",
      "Comfort Food",
    ],
  },
];

export const DINING_CUISINE_OPTIONS = DINING_CUISINE_OPTION_GROUPS.flatMap(
  (group) => group.options
);

export function canonicalizeOption(value: string): string {
  return value.trim().toLowerCase();
}
