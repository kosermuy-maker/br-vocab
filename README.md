# 单词冲刺器 · Ebbinghaus Vocab Trainer

基于艾宾浩斯曲线词表的**静态背单词网页**：免安装、打开即用。

- **巴朗词库**：Lesson **1–40**，约 **1938** 词
- **作文模式**：**会拼写**（约 78 词，打字拼写）+ **要认识**（约 910 词，翻卡）+ **作文错词**（约 40 词，个人错词本，强制打字拼写）

**在线试用：** https://kosermuy-maker.github.io/br-vocab/

> 进度保存在浏览器本地（`localStorage`）。换手机 / 换浏览器不会自动同步；别人打开同一个链接也**不会**覆盖你的进度。词库与子模式的进度互相独立。

---

## 功能

- 词库切换：**巴朗 1–40** | **作文**
- 作文子模式：**会拼写** | **要认识** | **作文错词**（会拼写/作文错词均为输入框打字判对错）
- 按单元选择（巴朗可多选）
- 顺序背词 / 随机背词
- 错题本（搜索、按单元/子模式筛选）
- 复习提醒（艾宾浩斯阶段到期列表，可一键开始复习）
- 单词发音（浏览器内置语音；可开「自动发音」）
- 桌面快捷键（翻卡模式）：↑ 显示释义 · ← 不认识 · → 认识 · 空格/回车下一张 · `P` 发音

## 怎么用

### 手机 / 任意浏览器

打开：https://kosermuy-maker.github.io/br-vocab/

顶部切换「巴朗 1–40 / 作文」。作文模式下再选「会拼写」「要认识」或「作文错词」。

界面按手机应用布局：底部「复习 / 错题 / 面板」，背词卡占满一屏。

已支持 PWA：可用浏览器「添加到主屏幕」，装成独立图标的应用；装过一次后**离线也能打开**（Service Worker 缓存）。若页面看起来是旧版，可强刷或清一次站点缓存。

### 本地打开

```bash
git clone https://github.com/kosermuy-maker/br-vocab.git
cd br-vocab
# 用浏览器打开 index.html 即可（无需构建）
```

## 技术说明

- 纯静态：`index.html` + `app.js` + `styles.css` + `data/`
- 词库数据：`data/vocab.json` 与 `data/vocab-data.js`（`window.VOCAB_DATA`）保持一致
- 作文词来源：考研写作必拼表 / 图表认识表 / 书本核心词与精彩词汇
- **作文错词维护**：老师批改后新增错词时，只改 `data/essay-misspell.json`，再运行 `python3 scripts/build_essay_vocab.py` 编进 `vocab.json` / `vocab-data.js`，然后同步 **GitHub + 桌面 `br`**
- PWA：`manifest.webmanifest` + `sw.js` + `icons/`（可安装、可离线）
- 无后端、无账号
- 可选：用 `scripts/extract_pdf_words.py` 从 PDF 重新提取巴朗词表；`scripts/build_essay_vocab.py` 重建作文词与裁剪 Lesson 41+

## 反馈

欢迎提 [Issue](https://github.com/kosermuy-maker/br-vocab/issues)。

---

MIT-ish / 学习自用欢迎；词表来源于艾宾浩斯曲线版单词材料与考研写作资料，请自行注意版权使用范围。
