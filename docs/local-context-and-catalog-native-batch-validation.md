# Local context and offline catalog: complete native journeys

Executed 2026-10-26 in the dot Linux cloud computer. This is one combined QA
batch for existing functionality, not three new features or an incident repair.
No production code or tests change with this document.

## Runtime and safety scope

Each journey used a separate loopback fixture and owned Chromium tab. The 138
runtime files were copied from the fixed local source used by the Layout reload
acceptance; `newtab.js` Git blob is
`550a702fef46fa51bfbd6f9743a47fcd8119f3e5` and `shared/layout.js` is
`d8e13b4fcca62f31d95c26224184101874b37fda`. Fixture HTML injects a synthetic
storage/readback bridge before production scripts; storage records, user input
and task text are synthetic. Actual views, controllers and ordinary browser
interactions are used. This is not installed-extension storage or upgrade
validation. No original Options/file-selection approval, file upload, model
connection, provider permission, paid service or external website was used.
Screenshots were inspected locally and not uploaded.

## 8788: manually supplied task JSON -> actual homepage Tasks

Through the normal Tools disclosure, open AI context Q&A, select **Draft tasks
for review**, and expand **Review external task JSON**. Enter three synthetic
single-line tasks in the textarea—not a file picker—and explicitly load them.
Edit the third task in the editable result JSON and uncheck the second task.
Review displays the exact first and edited third text in order. The synthetic
write count remains zero through loading, editing, selection and review.

Explicit **Add these tasks (2)** commits one batch write. Closing the panel
returns to the actual homepage Tasks list with the original task plus exactly
the selected first and edited third tasks. The omitted task is absent; the
original task ID, version and timestamps remain unchanged. The other three
personal modules, both global libraries, privacy/sync and second workspace
remain equal to seed. Question, connection and key remain empty; no sources or
model are selected and no request is sent.

An early locator action before opening Tools could not activate the entry;
opening the normal visible disclosure succeeded. The accessibility snapshot
labeled closed select options disabled, while read-only DOM inspection showed
both native `option.disabled` flags false. Ordinary selection changed mode; no
forced event or disabled-control bypass was used.

## 8789: saved and temporary sources -> local review -> exact copy

Select a saved global Collection and the current workspace's saved note. Add a
synthetic temporary excerpt: it starts unchecked and is explicitly described as
unverified. Select it, then search source titles so that the two saved selections
are hidden. Local review includes all three exact sources, the synthetic
question and the manual-source provenance warning. Write count remains zero.

**Clear source filters** preserves the reviewed text exactly. Explicit **Copy
reviewed prompt** succeeds without a new permission prompt. Reading the native
clipboard immediately after this synthetic copy matches the complete displayed
review string exactly; no pre-existing clipboard contents were read.

Editing the outgoing note excerpt clears and hides the old review. Explicit
re-review includes the changed outgoing text, but does not change the saved
Scratchpad. All personal modules, both global libraries, privacy/sync and the
second workspace remain equal, with zero writes throughout. Closing the panel
uses the ordinary explicit discard confirmation for temporary review inputs.
The close click timed out at the automation boundary with its confirm already
open; that existing dialog was read and accepted once, without replaying the
click. The homepage still displays the original saved note.

## 8790: AI catalog selection -> one new personal group -> home

The current offline catalog validates as **149 sites, 28 in AI**. The existing
ChatGPT/OpenAI, Claude, Grok and DeepSeek entries have operator/pricing fields and
source-review dates. This batch checks the stored UI and transaction contract;
it does not reverify today's external pricing, ownership or availability.

The synthetic workspace starts with an existing ChatGPT shortcut in Work plus
two unrelated cards. In Discover sites:

1. Select the built-in AI category. Filter operator location to US, select
   Claude and Grok, then change the filter to CN and select DeepSeek. The UI
   retains all three selections and explicitly shows two hidden by filters.
2. Choose **New personal category**, enter a synthetic AI group name, and
   review. The review lists the three exact official URLs and the new category;
   write count is still zero. Expanding Claude details visibly shows Anthropic,
   US, free + paid plans, and **Source reviewed: 2026-10-12**. No source link is
   opened and no offline label is changed.
3. **Create category and add (3)** produces one synthetic storage transaction
   containing the new category and its three cards. Original card objects and
   existing ChatGPT remain unchanged. Work remains selected with two cards.
4. Explicit **View first added shortcut on home** switches normally to the new
   three-card group and focuses Claude, without opening its website.
5. Reopening the directory shows existing ChatGPT as already added in Work and
   Claude as already added in the new group. Their selection/Add controls are
   disabled; no duplicate write or URL-based move occurs.

All personal modules, both global libraries, privacy/sync and the second
workspace remain equal. The one-write count refers to synthetic Chrome-storage
transactions; the explicit home category switch retains its normal local
preference behavior and is not described as zero browser writes.

## Regression evidence and cleanup

- External task JSON + task editing complete model files: **52/52**, exit 0.
- Context view + temporary sources + source-search shortcut files: **210/210**,
  exit 0.
- Navigation catalog + real new-category flow files: **23/23**, exit 0.

These are the actual separate focused runs, not a new full-suite claim. Existing
models already cover the corresponding boundaries; no duplicate tests or
manufactured production fixes were added. The earlier Web Locks fixture CI
failure and correction remain documented separately in
`library-and-shortcut-complete-journeys-validation.md`.

Owned tabs 30, 31 and 32 were closed. Each server received Ctrl-C and displayed
its STOPPED marker; each dedicated Terminal tab was closed. The final inventory
after each journey contained only the original tab 9, which was not interacted
with. No Release, CWS upload, upgrade validation or file-approval resolution is
implied by this batch.
