import type { Location, MediaAsset } from '../../api'

export const getLocationDisplayName = (loc?: Location) => {
  if (!loc) return ''
  return loc.neighborhoodName || loc.cityName || loc.countryName || loc.locationKey
}

export const getMediaAssetUrl = (img: MediaAsset) => (
  img.url
  || `${import.meta.env.VITE_PAYLOAD_API_URL || 'http://localhost:4000'}/api/media-assets/file/${img.filename}`
)
