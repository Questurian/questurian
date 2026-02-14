/**
 * Script to remove 'mealTypes' field from all existing Payload CMS documents
 * Run with: bun packages/server/scripts/remove-meal-types-from-payload.ts
 */

import { PayloadApiClient } from "../src/shared/services/external/payload-api.client";
import { EnvConfig } from "../src/shared/config/env.config";

type Collection = "dining" | "accommodations" | "attractions" | "nightlife";

async function removeMealTypes() {
  const config = new EnvConfig();
  const payloadClient = new PayloadApiClient(config);

  if (!payloadClient.isConfigured()) {
    console.error("❌ Payload CMS is not configured. Check your environment variables.");
    process.exit(1);
  }

  const collections: Collection[] = [
    "dining",
    "accommodations",
    "attractions",
    "nightlife",
  ];

  let totalRemoved = 0;

  for (const collection of collections) {
    console.log(`\n🔍 Processing ${collection} collection...`);

    try {
      // Fetch all documents from the collection
      const response = await fetch(
        `${config.PAYLOAD_API_URL}/api/${collection}?limit=1000`,
        {
          method: "GET",
          headers: {
            Authorization: `JWT ${await (payloadClient as any).ensureAuthenticated()}`,
          },
        }
      );

      if (!response.ok) {
        console.error(
          `❌ Failed to fetch ${collection}: ${response.status} ${response.statusText}`
        );
        continue;
      }

      const result = (await response.json()) as {
        docs: Array<{
          id: string;
          title: string;
          mealTypes?: string[];
        }>;
      };

      const docsWithMealTypes = result.docs.filter((doc) => doc.mealTypes);

      console.log(
        `   Found ${docsWithMealTypes.length} document(s) with mealTypes field`
      );

      for (const doc of docsWithMealTypes) {
        try {
          // Update the document, sending null for mealTypes to remove it
          const updateResponse = await fetch(
            `${config.PAYLOAD_API_URL}/api/${collection}/${doc.id}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `JWT ${await (payloadClient as any).ensureAuthenticated()}`,
              },
              body: JSON.stringify({
                mealTypes: null,
              }),
            }
          );

          if (!updateResponse.ok) {
            console.error(
              `   ❌ Failed to remove mealTypes from "${doc.title}" (${doc.id}): ${updateResponse.status}`
            );
          } else {
            console.log(`   ✅ Removed mealTypes from "${doc.title}"`);
            totalRemoved++;
          }
        } catch (error) {
          console.error(
            `   ❌ Error updating "${doc.title}":`,
            error instanceof Error ? error.message : String(error)
          );
        }
      }
    } catch (error) {
      console.error(
        `❌ Error processing ${collection}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  console.log(
    `\n✅ Complete! Removed mealTypes field from ${totalRemoved} document(s).`
  );
}

removeMealTypes().catch((error) => {
  console.error("❌ Script failed:", error);
  process.exit(1);
});
