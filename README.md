# 单词冲刺器

这是一个基于 `艾宾浩斯曲线版 单词.pdf` 自动提取的本地背单词程序。

## 已完成

- 按 `Lesson 1` 到 `Lesson 40` 独立拆分单元
- 共提取 `1916` 个单词
- 支持随机背词
- 支持顺序背词
- 支持错题本
- 支持本地学习进度保存
- 支持按复习阶段自动生成到期复习列表
- 支持一键进入「到期复习」模式（复习提醒面板的「开始复习」按钮）
- 支持单词发音（🔊 按钮或快捷键 `P`，可开启「自动发音」，使用浏览器内置语音，无需联网下载）

## 直接使用

直接双击打开 [index.html](C:/Users/Master/Desktop/br/index.html) 即可。

## 重新提取 PDF

如果你后面替换了根目录下的 PDF，可以重新执行：

```powershell
C:\Users\Master\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe .\scripts\extract_pdf_words.py
```

提取后会自动更新：

- [data/vocab.json](C:/Users/Master/Desktop/br/data/vocab.json)
- [data/vocab-data.js](C:/Users/Master/Desktop/br/data/vocab-data.js)

## 手机访问（GitHub Pages）

https://kosermuy-maker.github.io/br-vocab/

仓库仍是 Private；站点已开启 Pages。进度保存在浏览器本地存储。

