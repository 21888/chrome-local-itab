# Safe AI batch selection — development validation

This ordinary feature retains manifest1.1.89 and does not publish a release.
Select visible adds the entire currently visible unselected set only when the
combined selection remains within12; hidden selections count and over-limit
requests are not truncated. Clear selection clears all checked sources including
hidden ones while preserving the question and temporary excerpt edits. Busy
states disable these actions; no-op selection does not invalidate a review.

The actual combined specialized-navigation and batch-selection tree passed
2426 Node tests with strict unhandled rejections, 64 Python tests and whitespace
checks. An independent review reported45 focused tests passed. Seven new AI
locale keys were merged without replacing existing navigation entries.

Native browser verification of this exact development runtime is pending.
Synthetic view/controller coverage does not establish native keyboard, layout,
provider behavior or a full language/theme matrix. No permission, network or
persistent-storage change is introduced. A later release requires bounded
native acceptance and final runtime identity verification before publication.
