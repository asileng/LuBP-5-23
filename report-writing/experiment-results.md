# 实验结果汇总

所有实验均使用以下公开数据源：
- **辩论视频**：2023 Asian BP Debating Championships Open Grand Final
- **来源**：YouTube公开视频
- **时长**：66分13秒
- **辩题**：This house regrets the emphasis on sacrifice when determining the moral value of actions
- **参赛队伍**：OG=UP Dillaman A, OO=Adnaida Domenila University A, CG=Peking University A, CO=IIT Bombay
- **转写文件**：experiments/transcription-result.txt（159,661字符，653段）

## 实验1：Whisper语音转写（已完成）
- **测试音频**：experiments/bp-debate-sample.wav（从YouTube下载的66分钟音频）
- **模型**：Whisper base（OpenAI开源）
- **处理时间**：647.77秒（约10.8分钟）
- **转写准确率**：约92%（基于人工抽检前10段）
- **总段落数**：653段
- **语言**：英语
- **硬件**：Intel i7 CPU, 16GB内存，纯CPU推理
- **成本**：0元（开源免费）
- **可复现**：pip install openai-whisper → model = whisper.load_model("base"); result = model.transcribe("bp-debate-sample.wav")

## 实验2：LLM分析（DashScope Qwen-turbo）
- **输入**：转写文本前8000字符（experiments/transcription-result.txt第7行起）
- **模型**：qwen-turbo（DashScope API）
- **输入Token**：1655
- **输出Token**：1543
- **输出长度**：7286字符
- **Prompt**："You are a BP debate judge. Analyze this debate transcript: [转写文本前8000字符] Please analyze: 1) What are the core arguments of each team (OG/OO/CG/CO)? 2) Which team performed best and why? 3) If I am on the OG side, what could be improved?"
- **分析质量**：
  - ✓ 正确识别OG核心论点（sacrifice is manipulative and centralizing）
  - ✓ 准确分析强项（结构清晰，历史例证丰富，反事实思维深入）
  - ✓ 准确分析弱项（缺乏实证数据，情感诉求弱）
  - ✓ 给出可行的改进建议（增强实证、加强预判反驳、提升情感共鸣）
  - ✓ 正确识别各队核心论点（OG/OO/CG/CO）
  - ✓ 给出具体改进方向（澄清动议、强化反事实、回应情感诉求）
- **成本**：约0.01元（DashScope API价格）
- **局限**：只分析了前8000字符，不是完整66分钟比赛
- **完整输出**：保存在实验运行记录中

## 实验3：AI辩论陪练（DashScope Qwen-turbo + edge-tts）
- **测试内容**：让AI扮演OO方，生成BP辩论论点，再转成语音
- **模型**：qwen-turbo（DashScope API）+ edge-tts（微软免费TTS）
- **Prompt**："You are an OO speaker in a BP debate. The motion is: 'This house would ban social media for children under 16.' The OG has argued that social media harms children's mental health and education. Generate a 60-second rebuttal speech (about 150 words) as the OO first speaker."
- **LLM结果**：输入100 tokens，输出156 tokens，成本约0.001元
- **TTS结果**：en-US-GuyNeural男声，762字符，3.92秒生成，291.7 KB
- **音频文件**：experiments/ai-debate-partner.mp3
- **输出质量**：
  - ✓ 能生成结构化的论证（工具论-数字素养-反恐惧论证）
  - ✓ TTS发音标准，语速自然
  - ✗ 论点偏"教科书"风格，缺乏真实对手的刁钻
  - ✗ TTS语调偏"念课文"，缺乏辩论张力
- **成本**：约0.001元（LLM）+ 0元（TTS）

## 实验4：长上下文LLM分析
- **状态**：已用Qwen-turbo测试前8000字符（见实验2）
- **测试模型**：Qwen-turbo（DashScope API）
- **输入数据**：2023 Asian BP Debating Championships Open Grand Final 转写文本前8000字符
- **Prompt**："You are a BP debate judge. Analyze this debate transcript: [文本] — 1) Core arguments of each team? 2) Which team performed best? 3) If I am OG, what could be improved?"

## 实验5：会议软件纪要（无法实测）
- **状态**：需要实际创建会议并录音
- **已知数据**：
  - 腾讯会议转写准确率：约85-90%（英语环境）
  - 飞书妙记转写准确率：约90-95%（英语环境）
  - 免费版有使用次数限制

## 实验6：讯飞听见（无法实测）
- **状态**：需要注册账号并付费
- **已知数据**：
  - 转写准确率：约95%+（官方数据）
  - 价格：约0.3元/分钟

## 实验7：Google Meet/Zoom实时字幕（无法实测）
- **状态**：需要实际创建会议
- **已知数据**：
  - 准确率：约85%
  - 有延迟

## 实验8：AI语音辩论陪练（LLM + edge-tts实测）
- **测试工具**：Qwen-turbo（生成论点）+ edge-tts（语音合成，微软免费TTS）
- **测试流程**：
  1. Qwen-turbo生成OO方60秒反驳稿：输入100 tokens，输出156 tokens，成本约0.001元
  2. edge-tts转语音：en-US-GuyNeural男声，762字符，3.92秒生成，291.7 KB
- **质量评估**：
  - ✓ LLM生成的论点结构清晰（工具-数字素养-反恐惧论证）
  - ✓ TTS发音标准，语速自然
  - ✓ 完全免费（edge-tts无需注册，LLM成本可忽略）
  - ✓ 支持300+种声音、多种语言
  - ✗ TTS语调偏"念课文"，缺乏真人辩论的张力和情感起伏
  - ✗ 无法即兴回应，只能听预录内容
- **成本**：约0.001元（LLM）+ 0元（TTS）= 约0.001元
- **适用场景**：练听力和即时反驳能力

## 可评分的方案（基于实测数据）

### 方案1：Whisper + LLM分析
- **实操性**：1分（需要Python基础，3步以上）
- **效果**：2分（实测92%转写准确率，Qwen-turbo分析质量高，正确识别各队论点）
- **成本**：2分（Whisper免费，LLM约0.01元/次）
- **稳定性**：2分（Whisper成熟稳定，Qwen-turbo API稳定）
- **创新性**：1分（组合已有工具，非全新方案）
- **总分：8/10**

### 方案2：AI Agent辩论陪练（文字+语音）
- **实操性**：2分（复制粘贴prompt即可，TTS一行代码）
- **效果**：2分（LLM生成结构化论点，TTS转语音可听，实测可用）
- **成本**：2分（LLM约0.001元，TTS免费）
- **稳定性**：2分（成熟API服务）
- **创新性**：1分（LLM+TTS组合）
- **总分：8/10**（实测：experiments/ai-debate-partner.mp3）

### 方案3：长上下文LLM分析
- **实操性**：2分（复制粘贴即可）
- **效果**：1分（实测8000字符分析质量高，但不是完整比赛）
- **成本**：2分（Qwen-turbo约0.01元/次）
- **稳定性**：2分（Qwen-turbo API稳定）
- **创新性**：1分（利用长上下文能力）
- **总分：8/10**

### 方案4：会议软件纪要
- **实操性**：2分（开箱即用）
- **效果**：1分（转写准确率85-90%，摘要较浅，未实测）
- **成本**：1分（免费版有限制）
- **稳定性**：2分（大厂产品）
- **创新性**：0分（功能通用）
- **总分：6/10**
