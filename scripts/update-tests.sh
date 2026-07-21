#!/bin/bash

# Use to update test fixtures and snapshots.
#
# Requires write access to danielparks-test/gh-pr-render-fixtures

set -e

npm install
npm run setup -- --owner danielparks-test
npm run record danielparks-test/gh-pr-render-fixtures 1
npm run record danielparks-test/gh-pr-render-fixtures 2
npm run record danielparks/htmlize 66
npm run update-readme
npx vitest run --update
