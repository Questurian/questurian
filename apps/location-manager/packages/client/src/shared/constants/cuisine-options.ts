export const CUISINE_OPTION_GROUPS = [
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
      "Steakhouse",
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
    label: "Dietary & Formats",
    options: [
      "Vegan",
      "Vegetarian",
      "Gluten-Free",
      "Healthy",
      "Street Food",
      "Cafe",
      "Coffee & Tea",
      "Bakery",
      "Desserts",
      "Ice Cream",
      "Brunch",
      "Bar & Grill",
      "Casual Dining",
      "Pub Food",
      "Comfort Food",
    ],
  },
] as const;

export const CUISINE_OPTIONS = CUISINE_OPTION_GROUPS.flatMap(
  (group) => group.options
);

export function parseCuisineInput(rawValue: string | null | undefined): string[] {
  if (!rawValue) return [];

  return Array.from(
    new Set(
      rawValue
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
  );
}

export function serializeCuisineInput(values: string[]): string {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).join(", ");
}
