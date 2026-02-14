/**
 * Script to remove 'features' field from all existing Payload CMS documents
 * Run with: bun packages/server/scripts/remove-features-from-payload.ts
 */

import { PayloadApiClient } from "../src/shared/services/external/payload-api.client";
import { EnvConfig } from "../src/shared/config/env.config";

type Collection = "dining" | "accommodations" | "attractions" | "nightlife";

async function removeFeatures() {
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
          features?: string[];
        }>;
      };

      const docsWithFeatures = result.docs.filter((doc) => doc.features);

      console.log(
        `   Found ${docsWithFeatures.length} document(s) with features field`
      );

      for (const doc of docsWithFeatures) {
        try {
          // Update the document, sending null for features to remove it
          const updateResponse = await fetch(
            `${config.PAYLOAD_API_URL}/api/${collection}/${doc.id}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `JWT ${await (payloadClient as any).ensureAuthenticated()}`,
              },
              body: JSON.stringify({
                features: null,
              }),
            }
          );

          if (!updateResponse.ok) {
            console.error(
              `   ❌ Failed to remove features from "${doc.title}" (${doc.id}): ${updateResponse.status}`
            );
          } else {
            console.log(`   ✅ Removed features from "${doc.title}"`);
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
    `\n✅ Complete! Removed features field from ${totalRemoved} document(s).`
  );
}

removeFeatures().catch((error) => {
  console.error("❌ Script failed:", error);
  process.exit(1);
});
