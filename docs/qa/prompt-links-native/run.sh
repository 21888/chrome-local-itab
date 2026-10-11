#!/bin/sh
export LANG=en_US.UTF-8 LANGUAGE=en_US
exec /workspace/shared/tasks-cap-native-1.1.18/browser/chrome-linux64/chrome --force-renderer-accessibility --lang=en-US --no-first-run --no-default-browser-check --gtk-version=3 --user-data-dir=/workspace/shared/prompt-links-native-qa/profile --load-extension=/workspace/shared/prompt-links-native-candidate/runtime --new-window chrome://newtab/ > /workspace/shared/prompt-links-native-qa/chrome.log 2>&1
