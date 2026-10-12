# Built-in navigation library

The new-tab shortcut header has a **Discover sites / 发现网站** button. Browse by category, search names or uses, then choose an existing personal category and add a site. No preset site is added automatically, and closing the library never saves a selection.

## What is included

The first version includes 84 unique sites and 116 bilingual use tags. The versioned, offline catalog covers AI, development, design, productivity, learning, search, news, video/music, social, shopping, travel, everyday life, finance data, careers, marketing, utilities, games, and public services. A site can have multiple category/use tags. Advanced filters combine use, company/operator location, organization, and pricing. The catalog is an editorial selection, not a traffic or popularity ranking.

Cards use local text marks, descriptions and a few tags. They do not fetch favicons. Official site and evidence links open only when clicked, in a new tab with `noopener noreferrer`. The source panel records evidence links and the review date. The review date means source review, not a live guarantee of every feature or region's availability. Missing facts remain `unknown`.

Pricing describes the linked consumer/service entry, not API prices or unlimited use. `free` means a free entry is documented; `freemium` means free and paid plans; `paid` means payment is needed for the described service; `not_applicable` covers shopping or public portals where a subscription label does not describe the entry. Check the official source for current terms. Operator location is not the product's nationality, access-country list, or hosting location.

## Privacy and saving

Browsing, searching and filtering are offline. There are no analytics, new permissions, remote catalog downloads or remotely executed code. Adding a link uses existing Sync and online-icon settings, displayed in the library, and rechecks both before saving.

The save transaction preserves existing link objects and categories. It deduplicates canonical HTTP(S) URLs across the current workspace, checks the preview against current shortcuts/categories/layout/privacy, retains existing identity coordinates, and verifies the written result. Concurrent changes require reopening. An unconfirmed result is never presented as a successful addition and is not blindly retried.

## Maintaining the catalog

Edit `shared/navigation-sites.js`; do not populate personal shortcuts or change defaults. Each record has a stable id, official HTTPS URL, name, local text icon, bilingual description, category IDs, use tags, company/operator and country (or `unknown`), pricing and explanatory note, evidence URLs, and `verifiedOn`. Use official evidence for volatile metadata; absence of a price on a landing page is not proof that a service is free.

Run the full Node and Python tests and build/verify the offline runtime package after changes. Browser checks should cover light/dark, narrow screens, keyboard focus, searching, combined filters and reset, empty results, existing links, selecting a personal category, repeated clicks, saving failures, workspace changes, closing during reads and pending-save dismissal protection.
