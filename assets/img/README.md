# Images

26 files, 3.1 MB in all. Every file is JPEG, sRGB, progressive, 4:2:0, quality 80, with no EXIF, XMP or ICC, and under 350 KB. One frame: 4:5 portrait, except `og.jpg` (1200×630). The phone and camera frames are 1500 px tall; the studio frames (sources 1, 3, 5, 12, 32, 36, 38) are at their native size and must never be upscaled. The `*-600.jpg` files are 4:5 copies of the same crops, 750 px tall, used by the home grid's srcset and by the media kit (its portrait and its row of six).

Made from the originals with sips (crop, resize, convert to sRGB) and cjpeg (encode). The crop for each file is in the build specification (spec.md §D), with three exceptions recorded below.

| File | Pixels | Source | Used on | Size |
|---|---|---|---|---|
| `plate-red-skirt.jpg` | 1050×1313 | 38 | home tile 1 (/sessions/); source of og.jpg | 158 KB |
| `plate-red-skirt-600.jpg` | 600×750 | 38 | home grid srcset copy of the tile above; media-kit portrait | 54 KB |
| `plate-oatmeal-coat.jpg` | 1200×1500 | 41 | home tile 2 (/about/); About plate and About og:image | 259 KB |
| `plate-oatmeal-coat-600.jpg` | 600×750 | 41 | home grid srcset copy of the tile above; media-kit row 3 | 74 KB |
| `plate-road.jpg` | 1200×1500 | 21 | home tile 3 (/brands/); Brands plate | 284 KB |
| `plate-road-600.jpg` | 600×750 | 21 | home grid srcset copy of the tile above; media-kit row 1 | 74 KB |
| `plate-loveseat.jpg` | 1048×1310 | 36 | home tile 4 (/letter/) | 112 KB |
| `plate-loveseat-600.jpg` | 600×750 | 36 | home grid srcset copy of the tile above | 46 KB |
| `plate-challenger-door.jpg` | 1200×1500 | 22 | home tile 5 (/cars/) | 246 KB |
| `plate-challenger-door-600.jpg` | 600×750 | 22 | home grid srcset copy of the tile above; media-kit row 2 | 75 KB |
| `plate-green-satin.jpg` | 795×994 | 3 | home tile 6 (/sessions/) | 82 KB |
| `plate-green-satin-600.jpg` | 600×750 | 3 | home grid srcset copy of the tile above | 53 KB |
| `plate-straw-bag.jpg` | 1200×1500 | 18 | home tile 7 (/about/) | 325 KB |
| `plate-straw-bag-600.jpg` | 600×750 | 18 | home grid srcset copy of the tile above; media-kit row 6 | 93 KB |
| `plate-profile.jpg` | 1003×1253 | 32 | home tile 8 (/letter/); Letter plate | 92 KB |
| `plate-profile-600.jpg` | 600×750 | 32 | home grid srcset copy of the tile above | 39 KB |
| `plate-garage.jpg` | 1086×1357 | 12 | home tile 9 (/cars/); Cars plate and Cars og:image | 171 KB |
| `plate-garage-600.jpg` | 600×750 | 12 | home grid srcset copy of the tile above; media-kit row 5 | 58 KB |
| `plate-linen-waistcoat.jpg` | 1200×1500 | 39 | home tile 10 (/guides/); Guides plate | 223 KB |
| `plate-linen-waistcoat-600.jpg` | 600×750 | 39 | home grid srcset copy of the tile above; media-kit row 4 | 73 KB |
| `plate-at-the-door.jpg` | 792×990 | 5 | home tile 11 (/contact/); Contact plate | 57 KB |
| `plate-at-the-door-600.jpg` | 600×750 | 5 | home grid srcset copy of the tile above | 35 KB |
| `plate-hand-to-temple.jpg` | 791×989 | 1 | home tile 12 (/sessions/); Sessions plate | 69 KB |
| `plate-hand-to-temple-600.jpg` | 600×750 | 1 | home grid srcset copy of the tile above | 47 KB |
| `plate-walking-away.jpg` | 1200×1500 | 23 | 404 plate | 244 KB |
| `og.jpg` | 1200×630 | 38 | og:image on every public page except About and Cars | 83 KB |

Source is the number in the photo index. Sizes are rounded to the kilobyte.

Three crops differ from the specification so that the black border of the studio print stays outside the frame:

- `plate-red-skirt.jpg`: `sips -c 1313 1050 --cropOffset 28 134` on IMG_5076.jpeg (the spec's 1340×1072 at offset 1 123 keeps the 26-px black bar along the top of the print). Output 1050×1313 instead of 1072×1340. Its 600 copy is cut from the same source one pixel inside that frame (`sips -c 1310 1048 --cropOffset 29 135`, an exact 4:5) and resized to 600×750.
- `plate-loveseat.jpg`: `sips -c 1310 1048 --cropOffset 8 75` on IMG_5074.jpeg (the spec's 1343×1074 at offset 5 62 keeps the 24-px black bar along the bottom). Output 1048×1310 instead of 1074×1343.
- `og.jpg`: `sips -c 686 1306 --cropOffset 110 7` on IMG_5076.jpeg, then `sips -z 630 1200` (the spec's 693×1320 at offset 110 0 is the print's full width and keeps the dark lines, 5 px each, along its left and right edges). Output 1200×630 as specified; the edge columns measure clean.

To replace a picture, keep the file name and the 4:5 frame, remake the -600 copy if it is a tile, and update the width/height attributes in the HTML; nothing else changes.
