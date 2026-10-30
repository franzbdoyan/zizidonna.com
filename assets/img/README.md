# Images

Every photograph on the site has one look, "4e": warm, with blues and the yellow road lines quietened, crisp, and with no vignette and no grain. It was chosen on 29 October 2026.

`tools/photos.py` in the project folder cuts, grades and exports every file here from the camera and studio originals. The originals are never published.

Each photograph comes in two formats at the same sizes:
- **JPEG:** quality 92, full-resolution colour (4:4:4), progressive. Every browser can show it.
- **AVIF:** quality 82, 4:4:4. Modern browsers take it instead; it is 30 to 50% smaller for the same look.

Each `<picture>` offers both, and `srcset` lets the browser pick the size. Studio frames are never upscaled, so `profile`, `red-skirt` and `mother-daughter` stop at their native width.

| Name | Original | Crop | Sizes (px wide) | Used on |
|---|---|---|---|---|
| `challenger-door-wide` | IMG_2889 | 0.98:1, with air above the roof and below her heels; shadows lifted 0.05 so the black car keeps its grille and wheels | 1200, 1800, 2400, 3024 | Home, top left on a desk (Women and muscle cars) |
| `challenger-door` | IMG_2889 | 4:5, shadows lifted 0.05 | 600, 960, 1440 | Home on a phone; media kit row |
| `road` | IMG_2197 | 4:5 | 600, 960, 1440, 2000 | Home, top right (Styling); media kit row |
| `collar-wide` | IMG_5927 | 16:10 | 1600, 2400, 3000 | Home, full width (Gray on purpose) |
| `collar-phone` | IMG_5927 | 4:5, ends above the handbag | 750, 1290 | The same, on a phone |
| `challenger-garage` | IMG_0033 | 4:5 | 960, 1440, 2000, 2560 | Home, the black car band |
| `straw-bag` | IMG_0599 | 4:5 | 600, 960, 1440, 2000, 2560 | Home (Strength training after 40); media kit row |
| `profile` | IMG_5070 (studio) | 4:5 | 600, 1003 | Home (Strong nose) |
| `mother-daughter` | mother-and-daughter.jpg | 4:5, the empty wall above cut | 960, 1333 | Home (Mother of a teenage girl) |
| `oatmeal-coat` | IMG_7525 | 4:5 | 600, 960, 1440, 2000 | About; media kit row |
| `grey-coat` | IMG_7950 | 4:5 | 960, 1440, 2000 | Sessions |
| `challenger-hood` | IMG_4620 | 4:5 | 960, 1440, 2000 | Collaborations |
| `hood-smiling` | IMG_4456 (1) | 4:5 | 960, 1440, 2000 | Contact |
| `walking-away` | IMG_4020 | 4:5 | 960, 1440, 2000 | 404 |
| `red-skirt` | IMG_5076 (studio) | 4:5 | 600, 1050 | Media kit portrait |
| `collar` | IMG_5927 | 4:5 | 600 | Media kit row |
| `garage-hood` | Car.jpeg | 4:5 | 600 | Media kit row |
| `og.jpg` | `challenger-door-wide` and `road`, side by side | 1200×630, made by `python3 tools/photos.py og` | — | The link preview for every page |

## Replacing a picture

1. Put the new original in `photos-originals/`.
2. Change its line in `PHOTOS` in `tools/photos.py`.
3. Run `python3 tools/photos.py <name>`.
4. If the proportions changed, update the `width` and `height` in the HTML.

Facetune exports and screenshots are never used.
