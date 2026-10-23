# v0.3 regional campaign map

The main map follows the approved 16:10 regional preview. The previous wider
preview's geographic width and height were each reduced to two thirds, around
114° E, 33.5° N. All 24 scenario city anchors remain inside the frame with space
around the network. The frame fits the available screen without stretching and
keeps margins between the map, page edges, heading and command dock.

`src/v03/geography/campaign-map.ts` defines the shared 1600 × 1000 world and
projection. City anchors, schematic route links, journey progress and the
physical background use these coordinates. City labels are placed separately
to avoid collisions in both languages. Map navigation does not change route
kilometres, travel estimates, city actions or combat rules.

## Physical background

- Runtime asset: `public/assets/v03/maps/campaign-regional-map.svg`.
- Reference data: Natural Earth 1:50m land and rivers/lake centerlines, available
  from the [physical vectors download page](https://www.naturalearthdata.com/downloads/50m-physical-vectors/).
- Inputs: [`ne_50m_land.geojson`](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_land.geojson)
  and [`ne_50m_rivers_lake_centerlines.geojson`](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_rivers_lake_centerlines.geojson).
- Natural Earth data is public domain. These are modern physical reference
  features, not a reconstruction of Han-era shorelines or river courses. No
  modern political boundaries are drawn. Route lines remain schematic city
  connections; the physical background has no role in simulation rules.
- The original square ink artwork is retained as a separate asset; the regional
  map uses the geographically aligned SVG background.

To regenerate offline, place the two input GeoJSON files in a directory as
`ne_50m_land.json` and `ne_50m_rivers_lake_centerlines.json`, then run:

```powershell
node tools/build-v03-campaign-basemap.mjs <geojson-directory>
```

The generator imports the runtime projection, clips the geometry to the world,
and prints the resulting SHA-256. Update the registered asset hash if the
generated file changes. No external map service is used at runtime.
