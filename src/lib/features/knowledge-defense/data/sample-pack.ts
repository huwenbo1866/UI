import type { QuestionPack } from '../core/types';

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
    { id: 'm2', difficulty: 'medium', prompt: '下列哪项属于可再生能源？', options: ['石油', '天然气', '太阳能', '煤'], answer: '太阳能', explanation: '太阳能可以持续获得，属于可再生能源。' },
    { id: 'm3', difficulty: 'medium', prompt: '“因为……所以……”这组关联词通常表示什么关系？', options: ['并列', '转折', '因果', '递进'], answer: '因果', explanation: '前者说原因，后者说结果，属于因果关系。' },
    { id: 'm4', difficulty: 'medium', prompt: '水循环中，云中的水落回地面的过程叫？', options: ['蒸发', '凝结', '降水', '融化'], answer: '降水', explanation: '雨、雪等从云中落下都属于降水。' },
    { id: 'm5', difficulty: 'medium', prompt: '如果 2x = 10，那么 x = ?', options: ['2', '3', '5', '10'], answer: '5', explanation: '2x = 10，两边同时除以 2 得 x = 5。' },
    { id: 'm6', difficulty: 'medium', prompt: '英语单词 brave 更接近哪一项？', options: ['勇敢的', '迟到的', '柔软的', '吵闹的'], answer: '勇敢的', explanation: 'brave 表示勇敢的。' },

    { id: 'h1', difficulty: 'hard', prompt: '同样质量的冰和液态水相比，体积通常谁更大？', options: ['冰更大', '液态水更大', '一样大', '无法判断'], answer: '冰更大', explanation: '冰的密度比液态水小，所以相同质量下体积更大。' },
    { id: 'h2', difficulty: 'hard', prompt: '“先观察现象，再提出假设，最后用实验验证”更接近哪种学习方法？', options: ['机械记忆', '科学探究', '随意猜测', '纯背诵'], answer: '科学探究', explanation: '这是典型的科学探究流程。' },
    { id: 'h3', difficulty: 'hard', prompt: '如果一个长方形长增加 20%，宽不变，那么面积如何变化？', options: ['增加 20%', '增加 10%', '不变', '减少 20%'], answer: '增加 20%', explanation: '面积 = 长 × 宽，只有长增加 20%，面积也增加 20%。' },
    { id: 'h4', difficulty: 'hard', prompt: '阅读题中要判断作者观点，最关键的第一步通常是什么？', options: ['只看标题', '圈出关键词句', '直接猜答案', '先选最长选项'], answer: '圈出关键词句', explanation: '关键词句往往直接体现作者态度和核心信息。' }
  ]
};
