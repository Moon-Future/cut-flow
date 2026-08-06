export type CulturalDate = {
  name: string;
  kind: '国内节日' | '国际节日' | '农历节日' | '二十四节气';
  date: string;
  offsetDays: number;
};

const fixedDates: Record<string, Array<[string, CulturalDate['kind']]>> = {
  '01-01': [['元旦', '国内节日']],
  '02-02': [['世界湿地日', '国际节日']],
  '02-14': [['情人节', '国际节日']],
  '03-08': [['国际妇女节', '国际节日']],
  '03-12': [['植树节', '国内节日']],
  '03-15': [['国际消费者权益日', '国际节日']],
  '03-22': [['世界水日', '国际节日']],
  '04-22': [['世界地球日', '国际节日']],
  '05-01': [['劳动节', '国内节日']],
  '05-04': [['青年节', '国内节日']],
  '05-12': [['全国防灾减灾日', '国内节日']],
  '05-18': [['国际博物馆日', '国际节日']],
  '05-31': [['世界无烟日', '国际节日']],
  '06-01': [['儿童节', '国际节日']],
  '06-05': [['世界环境日', '国际节日']],
  '06-08': [['世界海洋日', '国际节日']],
  '06-26': [['国际禁毒日', '国际节日']],
  '07-01': [['建党节', '国内节日']],
  '08-01': [['建军节', '国内节日']],
  '09-03': [['中国人民抗日战争胜利纪念日', '国内节日']],
  '09-10': [['教师节', '国内节日']],
  '09-18': [['九一八事变纪念日', '国内节日']],
  '09-27': [['世界旅游日', '国际节日']],
  '10-01': [['国庆节', '国内节日']],
  '10-16': [['世界粮食日', '国际节日']],
  '10-24': [['程序员节', '国内节日']],
  '11-09': [['全国消防日', '国内节日']],
  '12-02': [['全国交通安全日', '国内节日']],
  '12-04': [['国家宪法日', '国内节日']],
};

const approximateSolarTerms: Record<string, string> = {
  '01-05': '小寒',
  '01-20': '大寒',
  '02-04': '立春',
  '02-19': '雨水',
  '03-05': '惊蛰',
  '03-20': '春分',
  '04-04': '清明',
  '04-20': '谷雨',
  '05-05': '立夏',
  '05-21': '小满',
  '06-05': '芒种',
  '06-21': '夏至',
  '07-07': '小暑',
  '07-23': '大暑',
  '08-07': '立秋',
  '08-23': '处暑',
  '09-07': '白露',
  '09-23': '秋分',
  '10-08': '寒露',
  '10-23': '霜降',
  '11-07': '立冬',
  '11-22': '小雪',
  '12-07': '大雪',
  '12-21': '冬至',
};

const lunarFestivals: Record<string, string> = {
  '1-1': '春节',
  '1-15': '元宵节',
  '5-5': '端午节',
  '7-7': '七夕节',
  '8-15': '中秋节',
  '9-9': '重阳节',
  '12-8': '腊八节',
};

const dateKey = (date: Date) =>
  `${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

const lunarKey = (date: Date) => {
  const parts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return month && day ? `${month}-${day}` : '';
};

export const findNearbyCulturalDates = (reference: Date, windowDays = 5): CulturalDate[] => {
  const localParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(reference);
  const part = (type: 'year' | 'month' | 'day') =>
    Number(localParts.find((item) => item.type === type)?.value);
  const center = new Date(Date.UTC(part('year'), part('month') - 1, part('day'), 4));
  const result: CulturalDate[] = [];
  for (let offsetDays = -windowDays; offsetDays <= windowDays; offsetDays += 1) {
    const normalizedOffset = offsetDays === 0 ? 0 : offsetDays;
    const date = new Date(center.getTime() + offsetDays * 86_400_000);
    const key = dateKey(date);
    for (const [name, kind] of fixedDates[key] ?? []) {
      result.push({name, kind, date: isoDate(date), offsetDays: normalizedOffset});
    }
    const solarTerm = approximateSolarTerms[key];
    if (solarTerm)
      result.push({
        name: solarTerm,
        kind: '二十四节气',
        date: isoDate(date),
        offsetDays: normalizedOffset,
      });
    const lunarFestival = lunarFestivals[lunarKey(date)];
    if (lunarFestival)
      result.push({
        name: lunarFestival,
        kind: '农历节日',
        date: isoDate(date),
        offsetDays: normalizedOffset,
      });
  }
  return result;
};
