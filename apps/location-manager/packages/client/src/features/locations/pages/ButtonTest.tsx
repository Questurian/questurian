import { CopyButton } from "@client/shared/components/ui";

export function ButtonTest() {
  return (
    <div className="flex min-h-[60vh] flex-col items-start gap-4 px-6 py-10">
      <h1 className="text-3xl font-semibold">Button Test Page</h1>
      <p className="text-muted-foreground">
        Click to copy the current URL.
      </p>
      <CopyButton
        variant="secondary"
        getCopyText={() => window.location.href}
      />
    </div>
  );
}
