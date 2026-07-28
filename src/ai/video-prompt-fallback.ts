type VideoPromptFallbackInput = {
  aspectRatio: string;
  subject: string;
  duration: number;
  visualStyle?: string;
};

const personPattern =
  /人物|人像|男人|女人|男性|女性|男孩|女孩|老人|孩子|观众|顾客|主持人|专家|医生|演员|博主|角色|面部|表情|手势|穿着|服装/u;
const dataPattern =
  /地图|地区|区域|国家|省份|城市|数据|频率|比例|分布|图表|曲线|柱状图|热力图|信息图|可视化/u;

export const buildFallbackVideoPromptZh = ({
  aspectRatio,
  subject,
  duration,
  visualStyle = '真实电影摄影质感、清晰光影和统一色调',
}: VideoPromptFallbackInput) => {
  const seconds = Math.max(3, Math.min(15, Math.round(duration || 5)));
  const middleEnd = Math.max(2, seconds - 2);
  const common =
    `镜头先稳定建立画面，再缓慢推近核心主体或进行小幅平滑横移，不大幅旋转、不突然切换场景；最后 1—2 秒自然停留在最能说明结果的状态。` +
    `保持首帧中的主体、背景环境、物体结构、空间布局、光线方向和色彩一致，动态自然连续，不让元素凭空出现或消失。` +
    `使用${visualStyle}，不要抽象特效、乱码界面、文字、字幕、标志、Logo 和水印。`;

  if (dataPattern.test(subject) && !personPattern.test(subject)) {
    return `${aspectRatio} 竖屏电影感视频，围绕“${subject}”完成清晰的数据可视化叙事。以对应图片作为首帧，保持地图轮廓、区域位置、配色、图例结构和视觉层级一致。开始 0—1 秒完整展示地图与数据范围；1—${middleEnd} 秒，不同地区按叙事顺序依次高亮，颜色深浅、标记或数据强弱平滑变化，清楚呈现地区之间的频率、比例或分布差异，所有变化保持空间对应准确；${common}`;
  }

  if (!personPattern.test(subject)) {
    return `${aspectRatio} 竖屏电影感视频，围绕“${subject}”完成一个由初始状态、可见变化到明确结果的微型镜头叙事。以对应图片作为首帧，保持核心物体、材质、结构、道具位置和环境一致。开始 0—1 秒稳定展示主体；1—${middleEnd} 秒，让关键物体按照真实物理规律产生与主题直接相关的运动、状态或结构变化，清楚表现变化阶段和空间关系，不新增人物；${common}`;
  }

  return `${aspectRatio} 竖屏电影感视频，围绕“${subject}”完成一个有起点、变化和结果的微型镜头叙事。以对应图片作为首帧，保持人物外貌、服装、道具位置、环境、光线和色彩一致。开始 0—1 秒稳定建立人物与主体关系；1—${middleEnd} 秒，人物完成与画面意图直接相关的自然动作，清楚表现视线、手部动作、面部情绪和身体反应，关键物体同步产生符合真实物理规律的变化；${common}`;
};
