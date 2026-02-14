/**
 * Script to remove extra fields from existing Payload CMS documents
 * Removes: email, operationHours, idealFor, cuisines, ianaTimeId
 * Run with: bun packages/server/scripts/cleanup-extra-payload-fields.ts
 */

import { PayloadApiClient } from "../src/shared/services/external/payload-api.client";
import { EnvConfig } from "../src/shared/config/env.config";

type Collection = "dining" | "accommodations" | "attractions" | "nightlife";

async function cleanupExtraFields() {
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

  const fieldsToRemove = [
    "email",
    "operationHours",
    "idealFor",
    "cuisines",
    "ianaTimeId",
  ];

  let totalUpdated = 0;

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
          [key: string]: unknown;
        }>;
      };

      let docsNeedingCleanup = 0;
      const updateData: Record<string, null> = {};

      for (const doc of result.docs) {
        const hasAnyField = fieldsToRemove.some((field) => field in doc);
        if (hasAnyField) {
          docsNeedingCleanup++;
          // Build update object with all fields to remove set to null
          fieldsToRemove.forEach((field) => {
            if (field in doc) {
              updateData[field] = null;
            }
          });
        }
      }

      console.log(
        `   Found ${docsNeedingCleanup} document(s) with extra fields to remove`
      );

      for (const doc of result.docs) {
        const hasAnyField = fieldsToRemove.some((field) => field in doc);
        if (!hasAnyField) continue;

        try {
          // Build update object for this specific doc
          const docUpdateData: Record<string, null> = {};
          fieldsToRemove.forEach((field) => {
            if (field in doc) {
              docUpdateData[field] = null;
            }
          });

          const updateResponse = await fetch(
            `${config.PAYLOAD_API_URL}/api/${collection}/${doc.id}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `JWT ${await (payloadClient as any).ensureAuthenticated()}`,
              },
              body: JSON.stringify(docUpdateData),
            }
          );

          if (!updateResponse.ok) {
            console.error(
              `   ❌ Failed to cleanup "${doc.title}" (${doc.id}): ${updateResponse.status}`
            );
          } else {
            const fieldsRemoved = Object.keys(docUpdateData);
            console.log(
              `   ✅ Removed [${fieldsRemoved.join(", ")}] from "${doc.title}"`
            );
            totalUpdated++;
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

  console.log(`\n✅ Complete! Cleaned up ${totalUpdated} document(s).`);
  console.log(`Removed fields: ${fieldsToRemove.join(", ")}`);
}

cleanupExtraFields().catch((error) => {
  console.error("❌ Script failed:", error);
  process.exit(1);
});
