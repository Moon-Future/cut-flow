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
    `整个镜头保持主体外观、背景环境、物体结构、空间布局、光线方向和色彩一致，动态自然连续，不让元素凭空出现或消失。` +
    `使用${visualStyle}，不要抽象特效、乱码界面、文字、字幕、标志、Logo 和水印。`;

  if (dataPattern.test(subject) && !personPattern.test(subject)) {
    return `${aspectRatio} 竖屏电影感数据可视化，画面要具体呈现${subject}。画面中央完整铺开与主题有关的地图、区域轮廓或数据图形，关键区域使用层次清楚的冷暖色块和发光标记区分，边缘保留简洁深色背景，所有图形位置、面积和强弱关系清晰可辨。开始 0—1 秒以稳定全景展示完整数据范围；1—${middleEnd} 秒，不同地区或数据组按因果顺序依次高亮，颜色深浅、标记密度和曲线高低平滑变化，直接展示频率、比例或分布差异；${common}`;
  }

  if (!personPattern.test(subject)) {
    return `${aspectRatio} 竖屏电影感微距场景，画面要具体呈现${subject}。核心物体占据画面中央和下半部，清楚显示它的形状、材质、表面纹理、初始状态以及与周围道具的空间关系；背景交代真实发生地点，并用浅景深排除无关信息。开始 0—1 秒稳定展示物体和环境；1—${middleEnd} 秒，关键物体按照真实物理规律产生与主题直接相关的运动、形变、结构或状态变化，连续展示变化阶段和明确结果，不新增人物；${common}`;
  }

  return `${aspectRatio} 竖屏电影感人物场景，画面要具体呈现${subject}。一名符合主题身份的人物位于画面中央偏前，服装、年龄和所处环境符合真实情境；前景放置人物正在操作或观察的关键物体，中景完整呈现上半身动作，背景用相关地点和道具交代事件发生环境。开始 0—1 秒稳定建立人物、物体和环境的关系；1—${middleEnd} 秒，人物完成与主题直接相关的自然动作，清楚表现视线转移、手部动作、面部情绪和身体反应，关键物体同步产生符合真实物理规律的变化；${common}`;
};
