import { Link } from "react-router-dom";
import { UtensilsCrossed, Music2 } from "lucide-react";

export function AddLocationChooser() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        <h1 className="text-2xl font-semibold text-foreground mb-2">Add New Location</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Choose which document flow you want to use.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            to="/add/restaurant"
            className="rounded-xl border border-border bg-card p-5 hover:bg-accent/40 transition-colors"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                <UtensilsCrossed className="w-5 h-5 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Restaurant</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Existing restaurant flow with current fields, validation, and pipeline.
            </p>
          </Link>

          <Link
            to="/add/nightlife"
            className="rounded-xl border border-border bg-card p-5 hover:bg-accent/40 transition-colors"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                <Music2 className="w-5 h-5 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Nightlife</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Full nightlife field form (space, scene, contact, media) stored as a nightlife document.
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
