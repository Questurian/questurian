/**
 * Script to remove 'currently_open' field from operationHours in all existing Payload CMS documents
 * Run with: bun packages/server/scripts/remove-currently-open-from-payload.ts
 *
 * Note: 'currently_open' is a real-time snapshot determined on the frontend, not needed in CMS
 */

import { PayloadApiClient } from "../src/shared/services/external/payload-api.client";
import { EnvConfig } from "../src/shared/config/env.config";

type Collection = "dining" | "accommodations" | "attractions" | "nightlife";

async function removeCurrentlyOpenFromOperationHours() {
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
          operationHours?: Record<string, unknown>;
        }>;
      };

      const docsWithCurrentlyOpen = result.docs.filter(
        (doc) => doc.operationHours && typeof doc.operationHours === 'object' && 'currently_open' in doc.operationHours
      );

      console.log(
        `   Found ${docsWithCurrentlyOpen.length} document(s) with currently_open in operationHours`
      );

      for (const doc of docsWithCurrentlyOpen) {
        try {
          // Strip out currently_open from operationHours
          const { currently_open, ...rest } = doc.operationHours as Record<string, unknown>;
          const cleanedOperationHours = Object.keys(rest).length > 0 ? rest : null;

          // Update the document with cleaned operationHours
          const updateResponse = await fetch(
            `${config.PAYLOAD_API_URL}/api/${collection}/${doc.id}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `JWT ${await (payloadClient as any).ensureAuthenticated()}`,
              },
              body: JSON.stringify({
                operationHours: cleanedOperationHours,
              }),
            }
          );

          if (!updateResponse.ok) {
            console.error(
              `   ❌ Failed to update operationHours for "${doc.title}" (${doc.id}): ${updateResponse.status}`
            );
          } else {
            console.log(`   ✅ Removed currently_open from "${doc.title}"`);
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
    `\n✅ Complete! Removed currently_open from ${totalRemoved} document(s).`
  );
}

removeCurrentlyOpenFromOperationHours().catch((error) => {
  console.error("❌ Script failed:", error);
  process.exit(1);
});
