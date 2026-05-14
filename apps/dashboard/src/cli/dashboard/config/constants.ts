export const ASCII_ART = `




       .--.
    .-(    ).
   .-(      ).           .--.
    (___.__)__)       .-(    ).
                     (___.__)__)

               __|__         
       ---o--o--(_)--o--o---
  
        Q U E S T U R I A N     

                .--.
             .-(    ).
            (___.__)__)



    `;

export const HEALTH_CHECK_INTERVAL = 30000;
export const HEALTH_CHECK_TIMEOUT = 2000;

// Width breakpoints (terminal columns). Smallest-first: each tier unlocks features.
export const BP = {
  S: 60,   // minimum usable layout
  M: 80,   // single column + service grid
  L: 100,  // two columns, side panels
  XL: 120, // full layout with ASCII art
} as const;

// Height breakpoints (terminal rows). Used to gate vertical-heavy content.
export const BP_H = {
  SHORT: 20,  // hide art, condense
  TALL: 32,   // room for art + side panels
} as const;
