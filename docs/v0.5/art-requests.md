# v0.5 art requests

**For:** the owner, who generates images with Codex's built-in `image_gen` as in v0.3 and the siege branch. **Consumed by:** tickets P-01, P-02, P-03 and B-08 in [tickets.md](tickets.md). **Status:** requested November 4, 2026; nothing generated yet.

v0.5 adds no new battlefield paintings, no portraits, no city art and no 2.5D. Everything below is a sprite, an effect or an interface piece in the existing ink style, so that the field keeps looking like one game.

## 1. Fixed conventions

**Style reference.** The six active single figures in `docs/v0.3/assets/generated/units-count-ink-04/` (`infantry.png`, `heavy-infantry.png`, `cavalry.png`, `elite-cavalry.png`, `archer.png`, `strong-archer.png`). They are side views facing screen-right, seen slightly from above, bold charcoal ink outline, flat ink-textured fills in charcoal, ivory and muted ochre, featureless faces, transparent background. Every new figure must read as the same soldier drawn again.

**Fixed prompt blocks.** Each request below is a subject paragraph plus these blocks, in this order. Change the blocks only here, then re-issue every prompt.

```text
STYLE_UNIT
Style: match the attached reference figure exactly in brushwork and colour handling: refined Chinese ink-brush illustration, bold readable charcoal ink outline, flat ink-textured colour fills in charcoal, warm ivory and muted ochre, slightly rough brush edges, minimal internal texture, high contrast, no facial features. The result must read instantly at 40–56 screen pixels. Match the reference's style, proportions, armour, clothing colours and weapon; change only what the subject paragraph asks for.
```

```text
CAMERA_SIDE
Camera: the same view as the reference, a side view seen slightly from above (about 20 degrees), figure facing screen-right, no perspective distortion.
```

```text
CAMERA_BACK
Camera: the same elevation as the reference (about 20 degrees from above) but seen from directly behind, the figure facing away from the viewer, walking or standing toward the top of the image.
```

```text
CAMERA_FRONT
Camera: the same elevation as the reference (about 20 degrees from above) but seen from directly in front, the figure facing the viewer, walking or standing toward the bottom of the image.
```

```text
SPRITE
Isolated subject only, centred on a square canvas with a small clear margin, on a true transparent alpha background. No paper rectangle, no ground disk, no cast shadow, no scenery.
```

```text
EXCLUDE
Do not include: any text, letters, calligraphy, seals or signatures; borders, frames or watermarks; grid lines; scenery, ground, horizon or sky; extra people, horses, flags, banners or pennants; modern objects.
```

If `image_gen` cannot produce alpha for a given run, ask for "a perfectly flat solid magenta (#FF00FF) background with no gradient" and key it out with the siege branch's `attempts/key.py` method; record which path was used in the item's `job.json`.

**Sizes and files.**

- Source: square PNG, 1024 px or larger, as produced. Saved as `docs/v0.5/art/<id>/source.png` with `prompt.txt`, `job.json` (`{id, tool, model, date, prompt, references[], background: 'alpha'|'magenta-keyed', status: 'draft'|'approved'}`) and any `attempts/` kept beside it.
- Runtime: `public/assets/v05/<group>/<id>.webp`, lossless for sprites (as `tools/prepare-unit-icons.mjs` does), produced by a new `tools/prepare-v05-art.mjs` that reads `docs/v0.5/art/manifest.json`, checks alpha, normalises figure height to the reference (person scale 0.64 on a 512 canvas, as `units-count-ink-04.json`), writes one-person and three-person layouts where the manifest asks, computes sha256 and generates `src/v03/rendering/assets-v05.generated.ts`.
- Contact sheets at 40 / 56 / 112 px from `tools/unit-icons-contact.mjs` for every figure, saved as `docs/v0.5/art/contact-<group>.png`.

**Acceptance for every item.** Alpha present (the prepare tool throws otherwise); figure height within 5% of the reference; same armour, colours and weapon as the reference figure; readable at 40 px on the contact sheet; status `approved` in the manifest set by the owner. Draft assets may ship behind the glyph fallback that `UnitSprite` already has, but P-02's acceptance needs approved A-01 and A-05.

**Facings in the engine.** East is the existing ink-04 figure. West is east mirrored by the renderer (`transform: scale(-1, 1)`); the shield hand swapping is accepted. North uses the back view, south the front view. Only two new views per figure are therefore needed.

## 2. Requests

Priority: P0 blocks P-02's acceptance; P1 is needed for the full v0.5 look; P2 is polish.

### A-01 Facing views (P0) — 12 images

For each of the six figures, a back view (north) and a front view (south), standing ready, same pose energy as the reference's standing figure. For cavalry the horse stands square; for archers the bow is held at rest; for infantry the spear is upright.

| Id                     | Reference            | Camera       | Subject line                                                                                     |
| ---------------------- | -------------------- | ------------ | ------------------------------------------------------------------------------------------------ |
| `infantry-back`        | `infantry.png`       | CAMERA_BACK  | The same ordinary infantryman with round shield and long spear, seen from behind, standing ready |
| `infantry-front`       | `infantry.png`       | CAMERA_FRONT | …seen from the front, standing ready, spear upright, shield at his side                          |
| `heavy-infantry-back`  | `heavy-infantry.png` | CAMERA_BACK  | The same heavy infantryman in lamellar armour, seen from behind                                  |
| `heavy-infantry-front` | `heavy-infantry.png` | CAMERA_FRONT | …seen from the front                                                                             |
| `cavalry-back`         | `cavalry.png`        | CAMERA_BACK  | The same lancer on the same horse, seen from behind, horse standing square, lance upright        |
| `cavalry-front`        | `cavalry.png`        | CAMERA_FRONT | …seen from the front, horse standing, lance upright                                              |
| `elite-cavalry-back`   | `elite-cavalry.png`  | CAMERA_BACK  | The same armoured rider and barded horse, seen from behind                                       |
| `elite-cavalry-front`  | `elite-cavalry.png`  | CAMERA_FRONT | …seen from the front                                                                             |
| `archer-back`          | `archer.png`         | CAMERA_BACK  | The same archer with recurve bow and hip quiver, seen from behind, bow at rest                   |
| `archer-front`         | `archer.png`         | CAMERA_FRONT | …seen from the front                                                                             |
| `strong-archer-back`   | `strong-archer.png`  | CAMERA_BACK  | The same veteran archer, seen from behind                                                        |
| `strong-archer-front`  | `strong-archer.png`  | CAMERA_FRONT | …seen from the front                                                                             |

Prompt skeleton:

```text
Use case: character turnaround. Asset type: ONE transparent single-soldier strategy-game sprite.
Subject: {subject line}. Exactly one person (one rider with one horse for cavalry). Full body, feet (hooves) and complete weapon visible.
{CAMERA_BACK or CAMERA_FRONT}
{STYLE_UNIT}
{SPRITE}
{EXCLUDE}
```

Used by P-02 for facing. Runtime layouts: one-person and three-person, like the east figures.

### A-02 Action poses (P1) — 6 images

East-facing only (mirrored for west; north and south use the ready view with a program lunge).

| Id                      | Reference            | Subject line                                                                                                                            |
| ----------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `infantry-attack`       | `infantry.png`       | The same infantryman thrusting the spear forward, shield raised, one foot forward                                                       |
| `heavy-infantry-attack` | `heavy-infantry.png` | The same heavy infantryman mid-swing with his weapon                                                                                    |
| `cavalry-ready`         | `cavalry.png`        | The same lancer on the same horse standing square, lance upright (the existing figure is the gallop and is used for advance and attack) |
| `elite-cavalry-ready`   | `elite-cavalry.png`  | The same armoured rider on the standing barded horse                                                                                    |
| `archer-attack`         | `archer.png`         | The same archer at full draw, arrow nocked, bow raised                                                                                  |
| `strong-archer-attack`  | `strong-archer.png`  | The same veteran archer loosing, bow raised, string just released                                                                       |

Same skeleton as A-01 with CAMERA_SIDE. Used by P-02 for the attack frame.

### A-03 Baggage train (P0 cart east; P1 other views) — 4 images

A new figure in the same style: a two-wheeled ox cart (牛车) loaded with grain sacks under a rope net, one driver walking beside the ox with a goad, in plain hemp clothes and a straw hat, no armour.

| Id                   | Camera       | Priority |
| -------------------- | ------------ | -------- |
| `baggage-cart`       | CAMERA_SIDE  | P0       |
| `baggage-cart-back`  | CAMERA_BACK  | P1       |
| `baggage-cart-front` | CAMERA_FRONT | P1       |
| `baggage-porter`     | CAMERA_SIDE  | P0       |

`baggage-porter` is a single porter carrying a grain sack on a shoulder pole, same clothes; the three-person layout for the baggage token is cart + two porters, composed by the prepare tool. Reference: `infantry.png` for style, with "no armour, no shield, no weapon" in the subject line.

Used by B-04 (token), P-02.

### A-04 Fleeing poses (P1) — 3 images

East-facing; the elite variants reuse the base figure of their arm.

| Id              | Reference      | Subject line                                                                                                   |
| --------------- | -------------- | -------------------------------------------------------------------------------------------------------------- |
| `infantry-flee` | `infantry.png` | The same infantryman running away in panic, spear dropped, shield slung on his back, looking over his shoulder |
| `cavalry-flee`  | `cavalry.png`  | The same rider bent low over the galloping horse's neck, lance gone, fleeing                                   |
| `archer-flee`   | `archer.png`   | The same archer running, bow held loosely, quiver spilling arrows                                              |

Used by P-02 for rout streaming.

### A-05 Effects (P0 arrow, dust, fire; P1 smoke) — 9 images

Square 512 px or larger, transparent, same ink-brush handling, no outlines on soft shapes.

| Id                                       | Subject                                                                                                                                                                                        | Priority |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `arrow`                                  | One war arrow in flight, horizontal, flying to the right, charcoal ink with an ochre fletching, slight motion blur toward the tail                                                             | P0       |
| `dust-1`, `dust-2`, `dust-3`             | Three stages of a dust cloud kicked up by galloping horses: small puff, rolling cloud, dispersing haze; warm grey ink wash                                                                     | P0       |
| `fire-small`, `fire-large`, `fire-ember` | Grass fire on open ground: a low flame cluster; a tall blaze with sparks; glowing embers and black ash; vermilion and orange ink accents on charcoal, as the only saturated colour in the game | P0       |
| `smoke-1`, `smoke-2`                     | Two rising smoke columns, light grey ink wash, soft edges, for burning forest                                                                                                                  | P1       |

Prompt skeleton:

```text
Use case: game effect sprite. Asset type: ONE transparent effect sprite.
Subject: {subject}.
Style: Chinese ink-wash (水墨) effect, loose wet brush, soft edges, no hard outline, restrained palette of charcoal and warm grey with {vermilion accents only for fire}. Must read at 32–64 screen pixels.
{SPRITE}
{EXCLUDE}
```

Used by P-02 (arrow arcs, charge dust, fire tiles, forest smoke).

### A-06 Duel scene (P1) — 5 images

| Id                | Size                    | Subject                                                                                                                                                                                                                                                                         |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `duel-backdrop`   | 1536×768, opaque        | A wide ink-wash field between two armies seen from the side: trampled grass, two tall banner poles without flags at the far left and far right, distant massed spears as faint ink marks, empty centre for two portraits; 水墨淡彩, rice-paper grain, light from the upper left |
| `duel-clash-1..3` | 512 square, transparent | Three impact strokes: a diagonal slash of black ink with a spray of droplets; a cross of two strokes; a burst stroke with a vermilion dot. No weapons, no figures                                                                                                               |
| `duel-draw`       | 512 square, transparent | A single soft grey ink splash, round, for a draw                                                                                                                                                                                                                                |

Prompt for the backdrop uses the battlefield style block from `docs/v0.3/battlefield-art/bf01-north-plain/README.md` ("traditional Chinese ink-wash painting with light color … Light from the upper left with very soft shadows") plus EXCLUDE without the "scenery" clause. The strokes use the A-05 skeleton.

Used by P-03.

### A-07 Card and arrangement seals (P1) — 12 images

256 px or larger, transparent, drawn as carved seal impressions (印章) in dark vermilion ink on nothing, one motif each, no characters (the program writes the names).

| Id                   | Motif                                    |
| -------------------- | ---------------------------------------- |
| `card-rally-all`     | A war drum                               |
| `card-stand-firm`    | A wall of overlapping shields            |
| `card-ambush`        | A spear tip among reeds                  |
| `card-feint`         | A footprint trail turning back on itself |
| `card-fire`          | A flame                                  |
| `card-night-raid`    | A crescent moon over a horse's head      |
| `card-vigilance`     | A lit torch                              |
| `card-challenge`     | Two crossed halberds                     |
| `arrangement-scale`  | Overlapping fish scales                  |
| `arrangement-crane`  | A crane with spread wings                |
| `arrangement-circle` | A ring of dots                           |
| `arrangement-column` | A serpent                                |

Prompt skeleton:

```text
Use case: game icon. Asset type: ONE transparent seal-style icon.
Subject: a carved Chinese seal impression (印章) of {motif}, as a single bold pictogram inside a square seal border with slightly broken edges, dark vermilion (#8e3b2c) ink on nothing.
Style: strong, simple, symmetrical, readable at 24 screen pixels; no characters, no text.
{SPRITE}
{EXCLUDE}
```

Used by P-01 (card picker, deployment panel). Order chips, facing wedges, army-morale bars, tier labels and signs are program-drawn (lucide icons or inline SVG) and need no art.

### A-08 Paper texture (P2) — 1 image

`paper-tile`, 512 square, opaque, seamlessly tileable warm rice paper for the morning report and card panels. The siege branch's `S6-05` paper may be reused if it tiles; otherwise generate with "seamless tileable texture, warm paper-white (#ece9e1), faint fibres, no vignette".

### A-09 Banner scroll (P2) — 1 image

`banner-scroll`, 1536×384, transparent outside the scroll: an unrolled horizontal ink scroll with blank centre for the outcome title and highlights; dark timber rollers at both ends; no text.

### A-10 Explicitly not requested

Night tint, rain and wind streaks, selection rings, order glyphs, facing wedges, morale bars, fire tile placement, speech bubbles, tier badges and signs are all drawn by the program. New battlefield paintings, officer portraits and any 2.5D asset are out of scope for v0.5.

## 3. Summary

| Group             | P0     | P1     | P2    | Total  |
| ----------------- | ------ | ------ | ----- | ------ |
| A-01 facing views | 12     | —      | —     | 12     |
| A-02 action poses | —      | 6      | —     | 6      |
| A-03 baggage      | 2      | 2      | —     | 4      |
| A-04 fleeing      | —      | 3      | —     | 3      |
| A-05 effects      | 7      | 2      | —     | 9      |
| A-06 duel scene   | —      | 5      | —     | 5      |
| A-07 seals        | —      | 12     | —     | 12     |
| A-08 paper        | —      | —      | 1     | 1      |
| A-09 scroll       | —      | —      | 1     | 1      |
| **Total**         | **21** | **30** | **2** | **53** |

Order of generation that unblocks the most: A-01 and A-05 fire/dust/arrow (P-02 acceptance), then A-03, then A-07 (P-01), then A-02, A-04, A-06, then the P2 pieces.
