// Deliberately includes tabs, NBSP, leading/trailing blank lines and trailing spaces.
export const readerCopySource = '\n\tconst greeting = "你好 world";  \n\nconsole.log(greeting);\n'
export const readerPlainSource = 'first line\n\n\tlast line  '
export const readerInteractionContent = [
  "![长图](/reader-tall.svg \"原图说明 {qz-width=240}\")",
  "![宽图](/reader-wide.svg)",
  "![小图](/reader-small.svg)",
  "```javascript\n" + readerCopySource + "\n```",
  "```\n" + readerPlainSource + "\n```",
  "```html\n<br>\n<br />\n```",
  "```mermaid\ngraph TD\n  A[开始] --> B[完成]\n```",
].join("\n\n")
