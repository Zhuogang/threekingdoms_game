# v0.3 武将头像交付清单

覆盖 98/98 人：复用 37 人，新生成 45 人，修订 16 人。每人均有 256×256 和 128×128 WebP。

原有剧本资源不覆盖；符合规范的图片按字节复用。新图与修订图位于 public/assets/v03/portraits/，高清 PNG 与实际提示词、引用记录位于本目录 generated/。所有生成均使用内置 image_gen。

完整记录：[manifest](../../../public/assets/v03/portraits/manifest.json)。人物特征与基础提示词：[98 人规范](three_kingdoms_portrait_master_assets_98.json)。修订依据：[审查记录](../../../tools/portrait-v03-review.json)。总览：[98 人头像](officer-headshots-98.jpg)。

规范 ID zumao 对应旧游戏 ID zuzhao（祖茂），mateng 对应 maliang（马腾）；马良使用 maliang_shu。运行时路径以 manifest.entries[].files[].path 为准，相对于 public/。此交付补齐图片资源，不新增剧本人物或改动存档 ID。

重新导出：设置 PORTRAIT_SHARP_PATH 后运行 node tools/prepare-portraits-v03.mjs；校验运行 node tools/validate-portraits-v03.mjs。

| 规范 ID | 人物 | 处理 | 256px 资源（相对 public/） |
| --- | --- | --- | --- |
| caocao | 曹操 | reused | assets/portraits/caocao.webp |
| xiahoudun | 夏侯惇 | reused | assets/portraits/xiahoudun.webp |
| xunyu | 荀彧 | reused | assets/portraits/xunyu.webp |
| caoren | 曹仁 | reused | assets/portraits/caoren.webp |
| xiahouyuan | 夏侯渊 | reused | assets/portraits/xiahouyuan.webp |
| chengyu | 程昱 | reused | assets/portraits/chengyu.webp |
| yujin | 于禁 | reused | assets/portraits/yujin.webp |
| liubei | 刘备 | reused | assets/portraits/liubei.webp |
| guanyu | 关羽 | reused | assets/portraits/guanyu.webp |
| zhangfei | 张飞 | reused | assets/portraits/zhangfei.webp |
| jianyong | 简雍 | reused | assets/portraits/jianyong.webp |
| sunjian | 孙坚 | reused | assets/portraits/sunjian.webp |
| sunce | 孙策 | reused | assets/portraits/sunce.webp |
| huanggai | 黄盖 | reused | assets/portraits/huanggai.webp |
| chengpu | 程普 | revised | assets/v03/portraits/chengpu.webp |
| handang | 韩当 | revised | assets/v03/portraits/handang.webp |
| zumao | 祖茂 | reused | assets/portraits/zuzhao.webp |
| yuanshao | 袁绍 | reused | assets/portraits/yuanshao.webp |
| yanliang | 颜良 | reused | assets/portraits/yanliang.webp |
| wenchou | 文丑 | reused | assets/portraits/wenchou.webp |
| zhanghe | 张郃 | reused | assets/portraits/zhanghe.webp |
| tianfeng | 田丰 | reused | assets/portraits/tianfeng.webp |
| jushou | 沮授 | revised | assets/v03/portraits/jushou.webp |
| guotu | 郭图 | revised | assets/v03/portraits/guotu.webp |
| dongzhuo | 董卓 | reused | assets/portraits/dongzhuo.webp |
| lubu | 吕布 | reused | assets/portraits/lubu.webp |
| jiaxu | 贾诩 | reused | assets/portraits/jiaxu.webp |
| liru | 李儒 | reused | assets/portraits/liru.webp |
| lijue | 李傕 | reused | assets/portraits/lijue.webp |
| guosi | 郭汜 | reused | assets/portraits/guosi.webp |
| huaxiong | 华雄 | reused | assets/portraits/huaxiong.webp |
| zhangliao | 张辽 | revised | assets/v03/portraits/zhangliao.webp |
| liuyan | 刘焉 | reused | assets/portraits/liuyan.webp |
| liuzhang | 刘璋 | reused | assets/portraits/liuzhang.webp |
| zhangren | 张任 | reused | assets/portraits/zhangren.webp |
| yanyan | 严颜 | revised | assets/v03/portraits/yanyan.webp |
| wuyi | 吴懿 | reused | assets/portraits/wuyi.webp |
| huangquan | 黄权 | revised | assets/v03/portraits/huangquan.webp |
| zhaoyun | 赵云 | reused | assets/portraits/zhaoyun.webp |
| taishici | 太史慈 | reused | assets/portraits/taishici.webp |
| dianwei | 典韦 | reused | assets/portraits/dianwei.webp |
| xuchu | 许褚 | revised | assets/v03/portraits/xuchu.webp |
| xuhuang | 徐晃 | revised | assets/v03/portraits/xuhuang.webp |
| ganning | 甘宁 | reused | assets/portraits/ganning.webp |
| huangzhong | 黄忠 | revised | assets/v03/portraits/huangzhong.webp |
| weiyan | 魏延 | revised | assets/v03/portraits/weiyan.webp |
| zhouyu | 周瑜 | reused | assets/portraits/zhouyu.webp |
| lusu | 鲁肃 | revised | assets/v03/portraits/lusu.webp |
| fazheng | 法正 | revised | assets/v03/portraits/fazheng.webp |
| zhangsong | 张松 | revised | assets/v03/portraits/zhangsong.webp |
| chenqun | 陈群 | revised | assets/v03/portraits/chenqun.webp |
| mateng | 马腾 | reused | assets/portraits/maliang.webp |
| machao | 马超 | revised | assets/v03/portraits/machao.webp |
| xunyou | 荀攸 | new | assets/v03/portraits/xunyou.webp |
| guojia | 郭嘉 | new | assets/v03/portraits/guojia.webp |
| simayi | 司马懿 | new | assets/v03/portraits/simayi.webp |
| caohong | 曹洪 | new | assets/v03/portraits/caohong.webp |
| yuejin | 乐进 | new | assets/v03/portraits/yuejin.webp |
| lidian | 李典 | new | assets/v03/portraits/lidian.webp |
| pangde | 庞德 | new | assets/v03/portraits/pangde.webp |
| manchong | 满宠 | new | assets/v03/portraits/manchong.webp |
| caopi | 曹丕 | new | assets/v03/portraits/caopi.webp |
| caozhen | 曹真 | new | assets/v03/portraits/caozhen.webp |
| zhugeliang | 诸葛亮 | new | assets/v03/portraits/zhugeliang.webp |
| pangtong | 庞统 | new | assets/v03/portraits/pangtong.webp |
| maliang_shu | 马良 | new | assets/v03/portraits/maliang_shu.webp |
| masu | 马谡 | new | assets/v03/portraits/masu.webp |
| wangping | 王平 | new | assets/v03/portraits/wangping.webp |
| jiangwei | 姜维 | new | assets/v03/portraits/jiangwei.webp |
| jiangwan | 蒋琬 | new | assets/v03/portraits/jiangwan.webp |
| feiyi | 费祎 | new | assets/v03/portraits/feiyi.webp |
| liaohua | 廖化 | new | assets/v03/portraits/liaohua.webp |
| guanping | 关平 | new | assets/v03/portraits/guanping.webp |
| sunquan | 孙权 | new | assets/v03/portraits/sunquan.webp |
| zhangzhao | 张昭 | new | assets/v03/portraits/zhangzhao.webp |
| lvmeng | 吕蒙 | new | assets/v03/portraits/lvmeng.webp |
| luxun | 陆逊 | new | assets/v03/portraits/luxun.webp |
| zhugejin | 诸葛瑾 | new | assets/v03/portraits/zhugejin.webp |
| lingtong | 凌统 | new | assets/v03/portraits/lingtong.webp |
| zhoutai | 周泰 | new | assets/v03/portraits/zhoutai.webp |
| zhuran | 朱然 | new | assets/v03/portraits/zhuran.webp |
| xusheng | 徐盛 | new | assets/v03/portraits/xusheng.webp |
| dingfeng | 丁奉 | new | assets/v03/portraits/dingfeng.webp |
| gongsunzan | 公孙瓒 | new | assets/v03/portraits/gongsunzan.webp |
| taoqian | 陶谦 | new | assets/v03/portraits/taoqian.webp |
| liubiao | 刘表 | new | assets/v03/portraits/liubiao.webp |
| yuanshu | 袁术 | new | assets/v03/portraits/yuanshu.webp |
| hansui | 韩遂 | new | assets/v03/portraits/hansui.webp |
| zhanglu | 张鲁 | new | assets/v03/portraits/zhanglu.webp |
| chengong | 陈宫 | new | assets/v03/portraits/chengong.webp |
| gaoshun | 高顺 | new | assets/v03/portraits/gaoshun.webp |
| kongrong | 孔融 | new | assets/v03/portraits/kongrong.webp |
| xuyou | 许攸 | new | assets/v03/portraits/xuyou.webp |
| dengai | 邓艾 | new | assets/v03/portraits/dengai.webp |
| simashi | 司马师 | new | assets/v03/portraits/simashi.webp |
| caorui | 曹叡 | new | assets/v03/portraits/caorui.webp |
| zhugeke | 诸葛恪 | new | assets/v03/portraits/zhugeke.webp |
| liushan | 刘禅 | new | assets/v03/portraits/liushan.webp |
