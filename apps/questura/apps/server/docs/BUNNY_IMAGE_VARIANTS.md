# Bunny.net Image Variants Documentation

## Overview

Questura uses Bunny.net CDN with Dynamic Image API for on-the-fly image transformation. Instead of pre-generating multiple image sizes, the API transforms images dynamically based on URL parameters.

**Base URL:** `https://questurian-cdn.b-cdn.net/media/`

## Prerequisites

- Bunny Optimizer must be **enabled** on the Pull Zone
- Dynamic Image API must be **enabled** in Bunny Optimizer settings
- Files must be uploaded to the storage zone at `questurian`

## Image Variant Specifications

### 1. Large (Hero Images)
**Use case:** Full-width hero banners, large featured images
- **Width:** 1920px
- **Aspect Ratio:** 16:9 (landscape)
- **URL:** `?width=1920&aspect_ratio=16:9`

**Example:**
```
https://questurian-cdn.b-cdn.net/media/cross.png?width=1920&aspect_ratio=16:9
```

---

### 2. Vertical Rectangle
**Use case:** Portrait-oriented content, mobile-first layouts
- **Width:** 720px
- **Aspect Ratio:** 9:16 (portrait)
- **URL:** `?width=720&aspect_ratio=9:16`

**Example:**
```
https://questurian-cdn.b-cdn.net/media/cross.png?width=720&aspect_ratio=9:16
```

---

### 3. Medium (Article Thumbnail)
**Use case:** Article cards, content previews
- **Width:** 600px
- **Aspect Ratio:** 16:9 (landscape)
- **URL:** `?width=600&aspect_ratio=16:9`

**Example:**
```
https://questurian-cdn.b-cdn.net/media/cross.png?width=600&aspect_ratio=16:9
```

---

### 4. Odd Vertical Rectangle
**Use case:** Specific portrait layouts, special content displays
- **Width:** 560px
- **Aspect Ratio:** 10:16 (tall portrait)
- **URL:** `?width=560&aspect_ratio=10:16`

**Example:**
```
https://questurian-cdn.b-cdn.net/media/cross.png?width=560&aspect_ratio=10:16
```

---

### 5. Small (List Preview)
**Use case:** List items, compact cards, preview thumbnails
- **Width:** 300px
- **Aspect Ratio:** 16:9 (landscape)
- **URL:** `?width=300&aspect_ratio=16:9`

**Example:**
```
https://questurian-cdn.b-cdn.net/media/cross.png?width=300&aspect_ratio=16:9
```

---

### 6. Thumbnail (Admin UI)
**Use case:** Admin panel thumbnails, very small previews
- **Width:** 150px
- **Aspect Ratio:** 1:1 (square)
- **URL:** `?width=150&aspect_ratio=1:1`

**Example:**
```
https://questurian-cdn.b-cdn.net/media/cross.png?width=150&aspect_ratio=1:1
```

---

## Dynamic Image API Parameters

### Core Resizing Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `width` | number | Image width in pixels | `?width=600` |
| `aspect_ratio` | string | Desired aspect ratio (width:height) | `?aspect_ratio=16:9` |
| `height` | number | Image height in pixels (use with width) | `?height=400` |

### Cropping Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `crop` | string | Define rectangular crop area (x,y,width,height) | `?crop=800,1270,1100,2695` |
| `focus_crop` | string | Intelligent crop with focus point | `?focus_crop=1550,1150,1.0,0.74` |

### Enhancement Parameters

| Parameter | Type | Range | Description |
|-----------|------|-------|-------------|
| `sharpen` | boolean | true/false | Sharpen image edges |
| `gamma` | number | 0-100 | Gamma correction |
| `contrast` | number | 0-100 | Contrast adjustment |
| `brightness` | number | -100 to 100 | Brightness adjustment |
| `saturation` | number | -100 to 100 | Color saturation |
| `tint` | hex color | #RRGGBB | Apply color tint |

### Geometry Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `flop` | boolean | Mirror image horizontally |
| `rotate` | number | Rotation angle in degrees |

## Usage Examples

### Simple Resize (Width Only)
Maintains aspect ratio:
```
https://questurian-cdn.b-cdn.net/media/image.jpg?width=600
```

### Resize with Aspect Ratio
Forces specific dimensions:
```
https://questurian-cdn.b-cdn.net/media/image.jpg?width=600&aspect_ratio=16:9
```

### Crop and Enhance
Combine cropping with enhancements:
```
https://questurian-cdn.b-cdn.net/media/image.jpg?crop=800,1270,1100,2695&width=500&sharpen=true&gamma=25&contrast=4
```

### Portrait with Color Adjustment
```
https://questurian-cdn.b-cdn.net/media/image.jpg?width=720&aspect_ratio=9:16&saturation=20&brightness=5
```

## Implementation Notes

### For Frontend/API Developers

1. **Store only the base filename** in your database
2. **Construct URLs dynamically** with variant parameters
3. **Cache the URLs** for performance (Bunny caches transformed images)

Example in code:
```javascript
const baseUrl = `https://questurian-cdn.b-cdn.net/media/${filename}`;

// Generate variant URLs
const variants = {
  hero: `${baseUrl}?width=1920&aspect_ratio=16:9`,
  medium: `${baseUrl}?width=600&aspect_ratio=16:9`,
  thumbnail: `${baseUrl}?width=150&aspect_ratio=1:1`,
};
```

### Performance Considerations

- First request for a variant is transformed on-the-fly
- Subsequent requests serve from Bunny's cache
- Bunny Optimizer automatically compresses transformed images
- WebP format is automatically served to supported browsers

## Enabling Dynamic Image API

If image transformations aren't working:

1. Go to **Bunny.net Dashboard** → **CDN** → **Pull Zones**
2. Select your Pull Zone (`questurian-cdn`)
3. Navigate to **Optimizer** section
4. Ensure **Bunny Optimizer** is **Enabled**
5. Ensure **Dynamic Image API** is **Enabled**
6. Click **Save Configuration**
7. **Purge Cache** to clear old cached images

## Regional Configuration

Current setup:
- **Storage Zone:** `questurian`
- **Region:** `ny` (New York)
- **Storage Hostname:** `ny.storage.bunnycdn.com`
- **CDN Hostname:** `questurian-cdn.b-cdn.net`

Images are stored via the storage API at:
```
https://ny.storage.bunnycdn.com/questurian/media/{filename}
```

But accessed via the CDN at:
```
https://questurian-cdn.b-cdn.net/media/{filename}
```

## Troubleshooting

### Images Not Transforming
- Verify Dynamic Image API is enabled in Bunny Optimizer
- Check that parameters are URL-encoded
- Purge cache and try again
- Verify the base image URL is correct

### 404 Errors
- Check filename matches what's in storage
- Verify Pull Zone is connected to storage zone
- Check storage zone settings

### Performance Issues
- Enable WebP compression in Bunny Optimizer
- Use appropriate widths (don't request massive sizes)
- Bunny caches transformed images automatically
