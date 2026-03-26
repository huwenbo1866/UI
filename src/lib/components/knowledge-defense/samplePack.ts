import type { QuestionPack } from './types';

export const samplePack: QuestionPack = {
  id: 'sample-pack-001',
  title: '样例知识闯关包',
  description: '先用内置样题验证玩法，后续可替换成你的知识库题包接口。',
  questions: [
    { id: 'e1', difficulty: 'easy', prompt: '太阳每天大致从哪个方向升起？', options: ['东边', '西边', '南边', '北边'], answer: '东边', explanation: '因为地球自转，我们看到太阳大致从东方升起。' },
    { id: 'e2', difficulty: 'easy', prompt: '英语单词 apple 的意思是？', options: ['苹果', '香蕉', '橙子', '葡萄'], answer: '苹果', explanation: 'apple 就是苹果。' },
    { id: 'e3', difficulty: 'easy', prompt: '1 米等于多少厘米？', options: ['10', '100', '1000', '1'], answer: '100', explanation: '长度单位换算：1 米 = 100 厘米。' },
    { id: 'e4', difficulty: 'easy', prompt: '下面哪种动物会下蛋？', options: ['母鸡', '小猫', '兔子', '小狗'], answer: '母鸡', explanation: '鸡属于卵生动物。' },
    { id: 'e5', difficulty: 'easy', prompt: '我国的首都是哪座城市？', options: ['上海', '北京', '广州', '深圳'], answer: '北京', explanation: '中华人民共和国首都是北京。' },
    { id: 'e6', difficulty: 'easy', prompt: '三角形最明显的特征是什么？', options: ['有 3 条边', '有 4 条边', '是圆的', '没有角'], answer: '有 3 条边', explanation: '三角形有 3 条边、3 个角。' },
    { id: 'e7', difficulty: 'easy', prompt: '植物进行光合作用最需要哪一项？', options: ['阳光', '石头', '盐', '沙子'], answer: '阳光', explanation: '阳光是光合作用的重要条件。' },
    { id: 'e8', difficulty: 'easy', prompt: '一个星期有几天？', options: ['5 天', '6 天', '7 天', '8 天'], answer: '7 天', explanation: '一周共有 7 天。' },

    { id: 'm1', difficulty: 'medium', prompt: '水在 0℃ 以下通常会变成什么？', options: ['水蒸气', '冰', '盐', '云'], answer: '冰', explanation: '低于凝固点时，水会凝固成冰。' },
    { id: 'm2', difficulty: 'medium', prompt: '“因为……所以……”这组关联词通常表示什么关系？', options: ['转折', '因果', '并列', '递进'], answer: '因果', explanation: '前者说原因，后者说结果，属于因果关系。' },
    { id: 'm3', difficulty: 'medium', prompt: '下列哪一个数是质数？', options: ['9', '15', '17', '21'], answer: '17', explanation: '17 只有 1 和 17 两个正因数。' },
    { id: 'm4', difficulty: 'medium', prompt: '英语中规则复数一般在名词后加什么？', options: ['-ing', '-ed', '-s/-es', '-ly'], answer: '-s/-es', explanation: '规则复数通常在词尾加 s 或 es。' },
    { id: 'm5', difficulty: 'medium', prompt: '下列哪项属于可再生能源？', options: ['煤炭', '石油', '太阳能', '天然气'], answer: '太阳能', explanation: '太阳能可以持续获得，属于可再生能源。' },
    { id: 'm6', difficulty: 'medium', prompt: '长方形一定有几个直角？', options: ['1 个', '2 个', '3 个', '4 个'], answer: '4 个', explanation: '长方形的四个角都是直角。' },
    { id: 'm7', difficulty: 'medium', prompt: '下列哪项最适合做文章的中心句？', options: ['一串无关词语', '概括整段意思的句子', '标点符号', '随机数字'], answer: '概括整段意思的句子', explanation: '中心句应概括段落主要内容。' },
    { id: 'm8', difficulty: 'medium', prompt: '水循环中，云中的水落回地面的过程叫？', options: ['蒸发', '凝结', '降水', '沸腾'], answer: '降水', explanation: '雨、雪等从云中落下都属于降水。' },

    { id: 'h1', difficulty: 'hard', prompt: '下列哪一项最能说明蒸发现象？', options: ['冰融化成水', '水变成水蒸气', '水蒸气变成小水珠', '雨从天空落下'], answer: '水变成水蒸气', explanation: '蒸发是液态水变成气态水蒸气。' },
    { id: 'h2', difficulty: 'hard', prompt: '如果一个数同时是 2 和 3 的倍数，那么它一定是什么的倍数？', options: ['5', '6', '8', '9'], answer: '6', explanation: '2 和 3 的最小公倍数是 6。' },
    { id: 'h3', difficulty: 'hard', prompt: '英语句子 “She is reading.” 使用的是哪种时态？', options: ['一般现在时', '现在进行时', '一般过去时', '一般将来时'], answer: '现在进行时', explanation: 'be + doing 构成现在进行时。' },
    { id: 'h4', difficulty: 'hard', prompt: '科学实验中使用“控制变量法”时最关键的做法是？', options: ['所有条件都变', '只改变一个条件，其余保持一致', '不记录结果', '直接猜结论'], answer: '只改变一个条件，其余保持一致', explanation: '控制变量法要求一次只改变一个因素。' },
    { id: 'h5', difficulty: 'hard', prompt: '阅读题中“联系上下文理解词语”最重要的是？', options: ['只看这个词', '只查字典', '结合前后文意思判断', '随便猜'], answer: '结合前后文意思判断', explanation: '词语含义要放在语境中理解。' },
    { id: 'h6', difficulty: 'hard', prompt: '地图上通常用什么来帮助辨认方向？', options: ['标题', '图例和指向标', '页码', '颜色数量'], answer: '图例和指向标', explanation: '指向标和图例帮助识别方向和信息。' },
    { id: 'h7', difficulty: 'hard', prompt: '分数 3/4 与 0.75 的关系是？', options: ['不相等', '大于', '相等', '无法比较'], answer: '相等', explanation: '3 ÷ 4 = 0.75。' },
    { id: 'h8', difficulty: 'hard', prompt: '“先总说，再分说”属于哪类常见表达结构？', options: ['总分结构', '并列结构', '递进结构', '转折结构'], answer: '总分结构', explanation: '先概括后展开，属于总分结构。' }
  ]
};
