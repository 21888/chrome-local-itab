# Locate an unfilled prompt variable / 定位未填写变量

## English

When a preview has missing values, choose **Go to first unfilled variable** next
to the preview. It moves focus to the first still-missing field in the template's
first-occurrence order. Repeated names share one field; filled values and values
explicitly set with **Use empty value** are skipped. It works in saved current
previews, explicitly used historical previews and unsaved new-draft previews.

The button only calls focus on that current input. It does not change text,
selection, preview output, draft state or saved data, and does not copy, run a
model or read storage. Input updates never trigger this navigation automatically.
Use the native button with a pointer or keyboard; there is no new shortcut.

No action is available when every value is filled, the template has no variables,
literal mode is on, validation/capacity has failed, or the library's read/write
outcome is pending or uncertain. Old controls cannot focus a newer preview after
navigation, version changes, editor changes, closing or redraw. Hidden/inert
controls, background documents and active dialogs cannot take focus.

## 中文

预览缺少变量值时，点击预览旁的「定位首个未填写变量」，焦点会移到模板首次出现
顺序中的首个尚未填写字段。重复变量只对应一个字段；已填写或明确选择「使用空值」
的变量会跳过。已保存当前版本、明确使用的历史版本和未保存新草稿预览都支持。

按钮只聚焦当前字段，不改动文字、选区、预览、草稿状态或已保存数据，也不会复制、
运行模型或读取存储。输入更新不会自动跳转。可用鼠标或键盘操作原生按钮，没有新增快捷键。

全部填完、无变量、原文模式、校验或容量错误、读写未决或读取结果不确定时没有可用入口。
切换条目、使用另一历史版本、编辑、关闭或重绘后，旧按钮不能抢走新界面的焦点。
隐藏、inert、后台文档或打开的对话框期间也不能借此获取焦点。

## Verification boundary

The dedicated synthetic-DOM tests cover current/historical/new-draft ownership,
100-variable first-occurrence ordering, duplicate/prototype-like/Chinese/hyphenated
names, explicit empty values, invalid and pending states, stale and reattached
controls, hidden/inert/background/modal states, keyboard event guards and
English/Chinese/fallback labels. They assert unchanged stored data, draft input,
preview text, selection offsets and clipboard/storage counts where applicable.

These checks model focus ownership. They do not establish native scrolling,
browser Enter/Space synthesis, layout, visible focus-ring quality or assistive-
technology announcements. No native-browser or screen-reader result is claimed.
