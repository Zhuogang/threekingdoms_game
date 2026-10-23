# Asset records and version scope

The active v0.3 art source of truth is its [manifest](../v0.3/assets/manifest.json), [provenance](../v0.3/assets/provenance.md) and [art status/workflow](../v0.3/06-imagegen-and-artwork.md). Generated v0.3 assets remain draft; older visual approvals do not change that status.

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
