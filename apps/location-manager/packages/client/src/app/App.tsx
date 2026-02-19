import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Navbar } from "@client/shared/components/layout";
import { Home } from "@client/features/location-browse";
import {
  AddLocationChooser,
  AddAccommodationsLocation,
  AddAttractionsLocation,
  AddNightlifeLocation,
  AddRestaurantLocation,
} from "@client/features/location-create";
import { TaxonomyReview } from "@client/features/admin/pages/TaxonomyReview";
import { PayloadSync } from "@client/features/admin/pages/PayloadSync";
import { Health } from "@client/features/health/Health";
import { EditLocationRoute } from "./EditLocationRoute";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background text-foreground">
        <Navbar />
        <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/add" element={<AddLocationChooser />} />
            <Route path="/add/restaurant" element={<AddRestaurantLocation />} />
            <Route path="/add/nightlife" element={<AddNightlifeLocation />} />
            <Route path="/add/accommodations" element={<AddAccommodationsLocation />} />
            <Route path="/add/attractions" element={<AddAttractionsLocation />} />
            <Route path="/edit/:category/:id" element={<EditLocationRoute />} />

            <Route path="/admin/taxonomy" element={<TaxonomyReview />} />
            <Route path="/admin/payload-sync" element={<PayloadSync />} />
            <Route path="/health" element={<Health />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
