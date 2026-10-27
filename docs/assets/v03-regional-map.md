# v0.3 regional campaign map

Historical reference: the old regional SVG background and its generator were removed on 2026-10-26. The current runtime uses the China-wide ink painting; the projection and geographic rules continue independently.

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

The former offline SVG generator has been removed together with this retired background. The reference links above document its original geographic sources.
