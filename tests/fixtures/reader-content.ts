// Synthetic content only. No production article or private note is copied here.
const fence = String.fromCharCode(96).repeat(3)
export const readerTestContent = [
  "## 行内与围栏代码", "",
  "行内 `sample_id` 保持代码背景，合法反引号 `` `literal` `` 保留原字符。", "",
  fence + "python", "def sample():", '    marker = "`keep`"', "    return marker", fence, "",
  "## 多段引用", "",
  "> 第一段：保留作者写出的“原文引号”。", ">", "> 第二段继续引用，*手动强调*仍可辨认。", ">",
  "> 来源：[参考资料](https://example.test/reference)", "",
  "## 正文中部", "",
  ...Array.from({ length: 18 }, (_, index) => ["段落 " + (index + 1) + "：" + "这是用于检查阅读中部遮挡的合成文字。".repeat(5), ""]).flat(),
  "## 普通短表格", "",
  "| 项目 | 状态 |", "| --- | --- |", "| 示例 | 完成 |", "",
  "## 复杂宽表格", "",
  "| 写法 | 行为说明 |", "| --- | --- |",
  "| `async with create_test_session_factory() as example_session:` | 关闭会话，并保留清楚的说明栏。这段说明用于检查中文是否被挤成每行几个字，而不是数据库里的真实正文。 |",
  "| `async with create_test_session_factory.begin() as example_session:` | 正常退出时提交事务，发生异常时回滚；代码标识符应该保持完整。 |",
  "| `async with example_database.transaction() as example_session:` | 根据测试示例的事务边界完成操作，不执行任何真实数据库写入。 |", "",
  "表格后的[正文链接](https://example.test/after-table)仍可以点击和阅读。", "",
  "## 结尾", "", "合成内容结束。",
].join("\n")
