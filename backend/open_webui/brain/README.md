# data文件夹中的数据是经果 row_process 中的原始数据处理后的结果

# data 文件夹用来存放 《处理过后的》 聊天数据

# model 文件夹中是train文件夹中的训练文件训练出来的模型结果 

# router 文件夹是最终调用模型进行回归和分类的，输出回归分数（用来评估个性化程度）和分类结果（决定使用哪种prompt<策略调整>）

# config/personalization_brain.json 是在线路由配置，里面可以调整“新增聊天记录触发阈值”和每个策略对应的 prompt。

# runtime 场景下，数据库中的 chat_message 记录会按用户导出到 row_process/runtime/*.jsonl，
# 当新增聊天记录数达到配置阈值后，会触发 router 做一次新的回归/分类，并把结果写回用户画像配置。
