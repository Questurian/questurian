"""NOT IN USE. The Itinerary Pipeline is decommissioned.

The Listicle Itineraries builder (frontend feature ``listicleItineraries``)
replaced it and is the itinerary tool we actually use. The pipeline has no card
on the studio home page any more.

The code stays on purpose. Nothing here is deleted and the router is still
mounted, so old links and stored runs keep working. Treat this package as
frozen: do not build new work on it, and put itinerary changes in the builder
instead.
"""

from .api import router

__all__ = ["router"]
