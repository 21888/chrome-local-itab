# Deselect visible navigation results

Ordinary feature on 1.1.105. Explicit Deselect current results removes only currently visible selected sites; hidden selections, destination/category draft and other filters remain. It invalidates stale review and updates selected-only results/focus without writes. Existing full clear, review, confirmation and 20-site cap remain unchanged.

Implementation baseline full tests passed strict serial Node 2646/2646 and Python 81/81. Independent review reported no required changes. On the true 1.1.105 parent, release-prepared strict serial Node 2646/2646 and Python 81/81 also passed, with no failures/skips/cancellations. Native browser validation is pending. Synthetic behavior does not establish full browser, keyboard or accessibility coverage. No storage, provider, permission or catalog change.
