# Asset records and version scope

Current v0.3 runtime art is indexed by its [art status/workflow](../v0.3/06-imagegen-and-artwork.md) and family manifests: [campaign background](../v0.3/assets/campaign-china-full-ink-01.json), [city markers](../v0.3/assets/cities-front-ink-01.json), [city detail paintings](../v0.3/assets/cities-regional-ink-02.json), [units](../v0.3/assets/unit-squads-runtime.json) and [battlefield canvases](../v0.3/assets/battlefield-canvases.json). The original [manifest](../v0.3/assets/manifest.json) is an inactive unit-art archive; retired terrain/map files were removed on October 26. [Historical provenance](../v0.3/assets/provenance.md) preserves dated prompts and hashes. Technical integration does not imply human style approval.

The [98-person v0.3 portrait inventory](v0.3-portraits/asset-inventory.md) records the October 22, 2026 portrait delivery, reused images, revised age/identity variants, source prompts and full contact sheet. Its [runtime manifest](../../public/assets/v03/portraits/manifest.json) indexes both sizes without overwriting the earlier scenario portraits.

This directory retains earlier/shared records without moving image/JSON evidence or rewriting hashes:

| Record                                           | Scope                                                                                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| [Portrait credits](portrait-credits.md)          | Officer identity mappings, original portrait generation and review provenance; preserve stable IDs and exact approval scope. |
| [Campaign ink art](campaign-map-art.md)          | Earlier campaign background and city-symbol visual work, not the current v0.3 geography contract.                            |
| [Battlefield art](battlefield-art.md)            | Earlier battlefield regions/artwork, not the v0.3 24×20 map implementation.                                                  |
| [Combat unit art](combat-unit-art.md)            | Earlier unit visual work and sources.                                                                                        |
| [Visual validation](visual-update-validation.md) | Dated visual test/commit evidence; not a fresh v0.3 art approval.                                                            |

Other JSON/source artifacts here retain their original version/date. [Older game documentation](../archive/README.md) and [v0.3 runtime captures](../v0.3/evidence/rv-implementation-2026-10-21/README.md#fresh-runtime-captures) explain the distinction.
