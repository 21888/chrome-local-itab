# Find saved sites

Choose **Find saved sites** beside the shortcut heading and placement control. This separate local panel searches your saved shortcut titles, addresses and category names across all categories. It never sends the query to a web search provider.

- With focus on the page outside editing fields, press **/** to open the same panel, even when the web search module is hidden. The shortcut uses the typed character: Shift is allowed when your keyboard needs it for /; Ctrl, Alt, AltGraph and Meta combinations are left alone. It does not run during IME composition, key repeat, or while another dialog or menu is open. Text inputs, selectors and range controls keep their own keys. Ordinary buttons and links support this shortcut. Browser and address-bar shortcuts are unchanged.
- To disable this single-character shortcut, go to **Settings → Shortcuts → Module Visibility**, clear **Use / to open Find saved sites**, and save. Open a new tab, or finish your work before refreshing an existing tab. The visible **Find saved sites** button still works when the shortcut is disabled, and no / key hint is shown. Re-enabling follows the same save-and-refresh steps. Older configurations default to enabled. This preference is included in settings backups and optional configuration sync; no query is saved.
- Type text; matching is case-insensitive and supports Unicode. Empty input shows guidance, with no automatic launch.
- Results show title, category and address. Duplicate records remain distinct. Pages contain up to 50 results.
- Use local Up/Down keys to reach results, then activate a button with Enter or Space. Escape closes the panel and returns focus to where it was before the panel opened. IME composition does not launch a site.
- Clear or close discards the temporary query. Searching does not change shortcuts, categories, Tasks, layout or manual coordinates.

An explicit result activation briefly reserves a blank tab while checking the latest saved record. Deleted or changed results are refused and refreshed; read failure leaves a retryable message. Canceling closes only the still-blank tab owned by that activation. A tab you navigate yourself is never overwritten or closed. New duplicate records with stable IDs resolve independently; ambiguous legacy duplicates without IDs are refused rather than guessed.

Opening a selected website is normal navigation and can use the network. Typing, result paging and dismissal use no external provider, history lookup, clipboard access or stored query. Applied settings refreshes defer reloading while this panel or its validation is active, just as they preserve unfinished task work.
