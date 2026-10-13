# Navigation full-catalog category counts

Development on manifest1.1.109, based on official release109. Category buttons
show static counts from the complete built-in catalog, not the current search,
filter, saved state or selection. All categories counts141 unique sites;18
category memberships total175 because one site can belong to multiple categories.
A bilingual explanation and accessible labels distinguish this from result counts.
Only view styling/localization and tests change; catalog, storage, provider and
permission behavior are unchanged.

The frozen implementation passed2689/2689 strict Node tests with1 GiB heap and
serial execution,81/81 Python tests, full JS syntax/JSON/diff checks and112-file
runtime packaging. Tests cover category membership, unchanged counts across local
filters and saved/selected states, accessible labels and muted-token styling.
Native visual/keyboard validation is pending for this ordinary development commit.
No narrow-screen, zoom or screen-reader coverage is claimed before actual checks.
