# World clock editor spacing

The first native Settings captures showed the world-clock heading and controls touching the card edges. The editor now uses the existing padded section header and an inset body, matching neighboring Settings cards. Identifiers, labels, form controls and save behavior are unchanged.

A sourced-markup regression checks the header/body structure and unchanged unique control identifiers. The integrated suite passes 320 Node tests and 19 Python packaging tests. The layout rule itself is not a substitute for native rendering checks.

Native Chrome for Testing 155.0.8059.39 on cloud Linux verified the padded header/body and reachable wrapped controls in 1260×848 wide and 510×848 narrow windows (original captures 73–76). The narrow time-zone placeholder is clipped within its ordinary single-line input; labels and buttons fit. Window dimensions are not measured CSS viewports. The owned test window was closed normally. Runtime hashes for this markup/CSS-only delta were retained separately from the earlier clock behavior and toast tests.
