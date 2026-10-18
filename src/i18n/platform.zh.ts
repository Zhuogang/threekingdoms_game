export const PLATFORM_ZH: Record<string, string> = {
  'This save is too large. Campaign saves must be smaller than 5 MB.':
    '存档过大。战役存档必须小于 5 MB。',
  'This file is not valid JSON. Choose a campaign save file.':
    '此文件不是有效的 JSON。请选择战役存档文件。',
  'This save is damaged or uses an unsupported game version. Your current campaign is unchanged.':
    '此存档已损坏，或其游戏版本不受支持。当前战役未改变。',
  'Browser storage is unavailable. Export a save file to keep your progress.':
    '浏览器存储不可用。请导出存档以保留进度。',
  'Could not open browser storage. Export a save file to keep your progress.':
    '无法打开浏览器存储。请导出存档以保留进度。',
  'Another game tab is blocking storage. Close it and try again.':
    '其他游戏标签页正在阻止存储连接，请关闭该页后重试。',
  'Save failed. Your browser may have run out of space. Export a save file instead.':
    '保存失败，浏览器存储空间可能不足。请导出存档备份。',
  'The save transaction was interrupted. Please try again.': '保存操作被中断，请重试。',
  'Could not read saved campaigns.': '无法读取已保存的战役。',
  'Could not save your campaign.': '未能保存战役进度。',
};
export const PLATFORM_PATTERNS: readonly [string, string][] = [
  ['This save contains inconsistent game data: {error}', '存档中的游戏数据不一致：{error}'],
];
