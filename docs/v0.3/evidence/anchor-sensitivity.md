# C-grade map-anchor sensitivity

This calculation measures how uncertain city placement changes nearby **straight-line map distances**. It does not validate historical city locations, ancient road corridors, route kilometres, or travel times.

For each of the five C-grade anchors, the script moves the anchor 20 km and 40 km along each of eight compass bearings on a sphere with radius 6,371.0088 km. It recalculates distances to every directly connected city, rounded to the nearest 5 km as in the geography module, and reports the minimum and maximum change from the current straight-line distance. The route table’s nominal road kilometres and journey ETAs are unchanged by this analysis.

Reproduce the table from the repository root with:

```powershell
node tools/geography-anchor-sensitivity.mjs
```

| C-grade anchor        | Adjacent edge         | Baseline straight km | ±20 km anchor displacement: delta range | ±40 km anchor displacement: delta range |
| --------------------- | --------------------- | -------------------: | --------------------------------------: | --------------------------------------: |
| Tianshui (`tianshui`) | `changan--tianshui`   |                  335 |                              −20…+20 km |                              −40…+40 km |
| Tianshui (`tianshui`) | `hanzhong--tianshui`  |                  245 |                              −20…+20 km |                              −40…+40 km |
| Beihai (`beihai`)     | `beihai--pingyuan`    |                  215 |                              −20…+15 km |                              −40…+35 km |
| Beihai (`beihai`)     | `beihai--xiapi`       |                  300 |                              −20…+20 km |                              −40…+40 km |
| Puyang (`puyang`)     | `chenliu--puyang`     |                  125 |                              −20…+15 km |                              −40…+35 km |
| Puyang (`puyang`)     | `pingyuan--puyang`    |                  195 |                              −20…+20 km |                              −40…+40 km |
| Puyang (`puyang`)     | `puyang--xiapi`       |                  315 |                              −20…+20 km |                              −40…+40 km |
| Puyang (`puyang`)     | `puyang--ye`          |                   85 |                              −20…+20 km |                              −40…+40 km |
| Jiangxia (`jiangxia`) | `chaisang--jiangxia`  |                  190 |                              −20…+20 km |                              −35…+40 km |
| Jiangxia (`jiangxia`) | `jiangling--jiangxia` |                  200 |                              −20…+20 km |                              −40…+40 km |
| Jiangxia (`jiangxia`) | `jiangxia--shouchun`  |                  325 |                              −20…+20 km |                              −40…+40 km |
| Jiangxia (`jiangxia`) | `jiangxia--xiangyang` |                  255 |                              −20…+20 km |                              −40…+40 km |
| Jiangxia (`jiangxia`) | `jiangxia--xuchang`   |                  380 |                              −20…+20 km |                              −40…+40 km |
| Zitong (`zitong`)     | `chengdu--zitong`     |                  150 |                              −20…+20 km |                              −40…+40 km |
| Zitong (`zitong`)     | `hanzhong--zitong`    |                  240 |                              −20…+20 km |                              −40…+40 km |
| Zitong (`zitong`)     | `jiangzhou--zitong`   |                  265 |                              −15…+20 km |                              −35…+40 km |

The result shows the scale of map-distance sensitivity to the selected anchor points. It cannot determine which displaced point is historically correct; that still requires source and site review.
