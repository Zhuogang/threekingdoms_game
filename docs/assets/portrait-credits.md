# Officer portrait credits / 武将头像来源

Original imagined historical depictions created for this project with the built-in image_gen tool. These are artistic interpretations, not authenticated contemporary likenesses. No commercial game portraits or third-party portrait scans were reused.

本项目使用内置 image_gen 工具创作的历史人物艺术想象，并非经考证的同时代真实肖像。未使用商业游戏头像或第三方肖像扫描图。

The original collection was created on October 19, 2026 using OpenAI's built-in image_gen tool with no reference image inputs. Ma Chao was created on October 20, 2026 with the same built-in tool, then received a framing edit using his first generated image as the edit target. No other portraits were supplied as image inputs. The tool did not expose a model identifier. Each entry preserves its actual date, prompts, source history and checksums. Names identify imagined depictions, not authenticated likenesses. Generated-output use is subject to the applicable creation-service terms; no third-party image license is invented here.

The art direction and briefs are in [the prompt set](../../tools/portrait-spec.json). Individual provenance and rendition checksums are in [the bundled manifest](../../public/assets/portraits/credits.json). Only contain resizing and WebP compression are applied during delivery. Ma Chao's selected original and first draft are preserved in project-owned `.artifacts/portrait-sources/`; the original collection retains its historical tool-output source records. Runtime assets always use the bundled renditions.

Progress: **53/53 named officers**, plus 1/1 garrison; 108 runtime renditions. Fallbacks do not count as portrait coverage. The 190 scenario has 52 officers; Guandu adds Ma Chao, age 24 in 200 AD.

## Incremental preparation

Use the repository's installed Node dependencies. The encoder also needs `sharp`: set `PORTRAIT_SHARP_PATH` to an installed sharp package directory from Codex's `load_workspace_dependencies`, or provide a locally installed package. Run `node tools/prepare-portraits.mjs`, then `npm run validate:portraits`. No image-service API key is used for preparation.

For a new portrait, add its brief to the specification and a `.artifacts/portrait-source-<id>.json` record with `id`, `path`, actual `created` date, `scenarioYear`, exact `prompt`, `references`, and any `editPrompts`/`sourceHistory`. `PORTRAIT_SOURCE_DIR` can point to another source-record directory. Approved portraits retain their provenance and rendition bytes even if their originals are unavailable. Preparation checks their hashes and refuses silent replacement. Coverage is checked independently against both game scenarios.

| Stable ID    | Depicted person          | Scenario age | Scenario year | Created    | Inspector file    |
| ------------ | ------------------------ | -----------: | ------------: | ---------- | ----------------- |
| `caocao`     | Cao Cao / 曹操           |           35 |           190 | 2026-10-19 | `caocao.webp`     |
| `xiahoudun`  | Xiahou Dun / 夏侯惇      |           34 |           190 | 2026-10-19 | `xiahoudun.webp`  |
| `xunyu`      | Xun Yu / 荀彧            |           27 |           190 | 2026-10-19 | `xunyu.webp`      |
| `caoren`     | Cao Ren / 曹仁           |           22 |           190 | 2026-10-19 | `caoren.webp`     |
| `xiahouyuan` | Xiahou Yuan / 夏侯渊     |           27 |           190 | 2026-10-19 | `xiahouyuan.webp` |
| `chengyu`    | Cheng Yu / 程昱          |           49 |           190 | 2026-10-19 | `chengyu.webp`    |
| `yujin`      | Yu Jin / 于禁            |           29 |           190 | 2026-10-19 | `yujin.webp`      |
| `liubei`     | Liu Bei / 刘备           |           29 |           190 | 2026-10-19 | `liubei.webp`     |
| `guanyu`     | Guan Yu / 关羽           |           30 |           190 | 2026-10-19 | `guanyu.webp`     |
| `zhangfei`   | Zhang Fei / 张飞         |           23 |           190 | 2026-10-19 | `zhangfei.webp`   |
| `jianyong`   | Jian Yong / 简雍         |           29 |           190 | 2026-10-19 | `jianyong.webp`   |
| `sunjian`    | Sun Jian / 孙坚          |           35 |           190 | 2026-10-19 | `sunjian.webp`    |
| `sunce`      | Sun Ce / 孙策            |           16 |           190 | 2026-10-19 | `sunce.webp`      |
| `huanggai`   | Huang Gai / 黄盖         |           44 |           190 | 2026-10-19 | `huanggai.webp`   |
| `chengpu`    | Cheng Pu / 程普          |           36 |           190 | 2026-10-19 | `chengpu.webp`    |
| `handang`    | Han Dang / 韩当          |           34 |           190 | 2026-10-19 | `handang.webp`    |
| `zuzhao`     | Zu Mao / 祖茂            |           32 |           190 | 2026-10-19 | `zuzhao.webp`     |
| `yuanshao`   | Yuan Shao / 袁绍         |           36 |           190 | 2026-10-19 | `yuanshao.webp`   |
| `yanliang`   | Yan Liang / 颜良         |           29 |           190 | 2026-10-19 | `yanliang.webp`   |
| `wenchou`    | Wen Chou / 文丑          |           28 |           190 | 2026-10-19 | `wenchou.webp`    |
| `zhanghe`    | Zhang He / 张郃          |           23 |           190 | 2026-10-19 | `zhanghe.webp`    |
| `tianfeng`   | Tian Feng / 田丰         |           46 |           190 | 2026-10-19 | `tianfeng.webp`   |
| `jushou`     | Ju Shou / 沮授           |           32 |           190 | 2026-10-19 | `jushou.webp`     |
| `guotu`      | Guo Tu / 郭图            |           31 |           190 | 2026-10-19 | `guotu.webp`      |
| `dongzhuo`   | Dong Zhuo / 董卓         |           50 |           190 | 2026-10-19 | `dongzhuo.webp`   |
| `lubu`       | Lü Bu / 吕布             |           30 |           190 | 2026-10-19 | `lubu.webp`       |
| `jiaxu`      | Jia Xu / 贾诩            |           43 |           190 | 2026-10-19 | `jiaxu.webp`      |
| `liru`       | Li Ru / 李儒             |           38 |           190 | 2026-10-19 | `liru.webp`       |
| `lijue`      | Li Jue / 李傕            |           34 |           190 | 2026-10-19 | `lijue.webp`      |
| `guosi`      | Guo Si / 郭汜            |           35 |           190 | 2026-10-19 | `guosi.webp`      |
| `huaxiong`   | Hua Xiong / 华雄         |           31 |           190 | 2026-10-19 | `huaxiong.webp`   |
| `zhangliao`  | Zhang Liao / 张辽        |           21 |           190 | 2026-10-19 | `zhangliao.webp`  |
| `liuyan`     | Liu Yan / 刘焉           |           55 |           190 | 2026-10-19 | `liuyan.webp`     |
| `liuzhang`   | Liu Zhang / 刘璋         |           24 |           190 | 2026-10-19 | `liuzhang.webp`   |
| `zhangren`   | Zhang Ren / 张任         |           30 |           190 | 2026-10-19 | `zhangren.webp`   |
| `yanyan`     | Yan Yan / 严颜           |           45 |           190 | 2026-10-19 | `yanyan.webp`     |
| `wuyi`       | Wu Yi / 吴懿             |           29 |           190 | 2026-10-19 | `wuyi.webp`       |
| `huangquan`  | Huang Quan / 黄权        |           21 |           190 | 2026-10-19 | `huangquan.webp`  |
| `zhaoyun`    | Zhao Yun / 赵云          |           22 |           190 | 2026-10-19 | `zhaoyun.webp`    |
| `taishici`   | Taishi Ci / 太史慈       |           24 |           190 | 2026-10-19 | `taishici.webp`   |
| `dianwei`    | Dian Wei / 典韦          |           25 |           190 | 2026-10-19 | `dianwei.webp`    |
| `xuchu`      | Xu Chu / 许褚            |           22 |           190 | 2026-10-19 | `xuchu.webp`      |
| `xuhuang`    | Xu Huang / 徐晃          |           23 |           190 | 2026-10-19 | `xuhuang.webp`    |
| `ganning`    | Gan Ning / 甘宁          |           22 |           190 | 2026-10-19 | `ganning.webp`    |
| `huangzhong` | Huang Zhong / 黄忠       |           42 |           190 | 2026-10-19 | `huangzhong.webp` |
| `weiyan`     | Wei Yan / 魏延           |           20 |           190 | 2026-10-19 | `weiyan.webp`     |
| `zhouyu`     | Zhou Yu / 周瑜           |           16 |           190 | 2026-10-19 | `zhouyu.webp`     |
| `lusu`       | Lu Su / 鲁肃             |           18 |           190 | 2026-10-19 | `lusu.webp`       |
| `fazheng`    | Fa Zheng / 法正          |           16 |           190 | 2026-10-19 | `fazheng.webp`    |
| `zhangsong`  | Zhang Song / 张松        |           22 |           190 | 2026-10-19 | `zhangsong.webp`  |
| `chenqun`    | Chen Qun / 陈群          |           20 |           190 | 2026-10-19 | `chenqun.webp`    |
| `maliang`    | Ma Teng / 马腾           |           34 |           190 | 2026-10-19 | `maliang.webp`    |
| `machao`     | Ma Chao / 马超           |           24 |           200 | 2026-10-20 | `machao.webp`     |
| `garrison`   | City garrison / 城防守军 |           30 |           190 | 2026-10-19 | `garrison.webp`   |

Stable-ID exceptions are intentional: `maliang` is Ma Teng / 马腾; `zuzhao` is Zu Mao / 祖茂. Never infer the depicted person from these slugs or rename save IDs.
