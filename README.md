# 单词冲刺器 · Ebbinghaus Vocab Trainer

基于艾宾浩斯曲线词表的**静态背单词网页**：免安装、打开即用，约 **1916** 个单词（Lesson 1–40）。

**在线试用：** https://kosermuy-maker.github.io/br-vocab/

> 进度保存在浏览器本地（`localStorage`）。换手机 / 换浏览器不会自动同步；别人打开同一个链接也**不会**覆盖你的进度。

---

## 功能

- 按单元选择（可多选）
- 顺序背词 / 随机背词
- 错题本（搜索、按单元筛选）
- 复习提醒（艾宾浩斯阶段到期列表，可一键开始复习）
- 单词发音（浏览器内置语音；可开「自动发音」）
- 桌面快捷键：↑ 显示释义 · ← 不认识 · → 认识 · 空格/回车下一张 · `P` 发音

## 怎么用

### 手机 / 任意浏览器

打开：https://kosermuy-maker.github.io/br-vocab/

建议「添加到主屏幕」当小工具用。

### 本地打开

```bash
git clone https://github.com/kosermuy-maker/br-vocab.git
cd br-vocab
# 用浏览器打开 index.html 即可（无需构建）
```

## 技术说明

- 纯静态：`index.html` + `app.js` + `styles.css` + `data/`
- 无后端、无账号
- 可选：用 `scripts/extract_pdf_words.py` 从 PDF 重新提取词表（需本机 Python 与 PDF）

## 反馈

欢迎提 [Issue](https://github.com/kosermuy-maker/br-vocab/issues)。

---

MIT-ish / 学习自用欢迎；词表来源于艾宾浩斯曲线版单词材料，请自行注意版权使用范围。
