#!/bin/bash

# Use after merging the changes from scripts/release.sh

set -eo pipefail
shopt -s extglob

awk-in-place () (
  tmpfile=$(mktemp)
  original="$1"
  shift
  cp "$original" "$tmpfile"
  awk "$@" <"$tmpfile" >"$original"
  rm "$tmpfile"
)

check-changes () {
  if git ls-files --exclude-standard --other | grep . >/dev/null ; then
    echo 'Found untracked files:' >&2
    git ls-files --exclude-standard --other | sed -e 's/^/  /' >&2
    echo >&2
    echo 'Please commit changes before proceeding.' >&2
    return 1
  fi

  git diff --color --exit-code HEAD || {
    echo >&2
    echo 'Please commit changes before proceeding.' >&2
    return 1
  }
}

command -v gh &>/dev/null || {
  echo "gh not installed (https://cli.github.com)" >&2
  exit 1
}

command -v jq &>/dev/null || {
  echo "jq not installed (https://jqlang.org)" >&2
  exit 1
}

check-changes

repo=$(gh repo view --json url --jq .url)

version=$(jq -r .version package.json)
if git rev-parse --quiet --verify "refs/tags/v${version}" >/dev/null ; then
  echo "Tag v${version} already exists." >&2
  exit 1
fi

if grep '^## ' CHANGELOG.md | head -1 | grep -v '^## Release ' >/dev/null ; then
  echo 'Found non-release ## heading near start of CHANGELOG.md:' >&2
  grep '^## ' CHANGELOG.md | head -1 | grep -v '^## Release ' >&2
  # grep should fail and cause an exit, but just in case:
  exit 1
fi

npm install
npm run build

# Fix relative links in README, if present
url_prefix="${repo}/blob/v${version}/"
echo "Updating links in README.md (URL prefix '${url_prefix}')"
awk-in-place README.md -v url_prefix="$url_prefix" '
  $1 ~ /^\[[^]]+\]:$/ && $2 !~ /[a-zA-Z][a-zA-Z0-9+.-]*:/ {
    prefix = url_prefix
    if ($2 ~ /^\//) {
      # Get scheme://domain for absolute path
      match(url_prefix, /^[^:]+:\/\/[^\/]+/)
      prefix = substr(url_prefix, RSTART, RLENGTH)
    }
    $2 = prefix $2
  }
  { print }'

commit=$(git log --grep="^Release " -1 --format="%H")
if [[ -z "$commit" ]] ; then
  echo "Couldn’t find a release commit. Run scripts/release.sh first." >&2
  exit 1
fi

# Confirm changelog
changelog=$(mktemp)
echo -n "## " >"$changelog"
git log -1 --format="%B" "$commit" >>"$changelog"

if [[ $(head -1 "$changelog" | sed -e 's/:.*//') != "## Release ${version}" ]]
then
  echo "Most recent release was $(head -1 "$changelog") (commit $commit)" >&2
  echo "Version does not match ${version}. Run scripts/release.sh first." >&2
  exit 1
fi

${EDITOR:-vim} "$changelog"

npm login
npm publish

git restore README.md

git tag --sign --file "$changelog" --cleanup=verbatim "v${version}"
git push --tags origin

# Strip "## Release " prefix from first line.
title=$(head -1 "$changelog" | sed -e 's/^## Release //')
# Strip first line and the second line if its blank.
awk 'NR==1 || (NR==2 && /^$/) {next} {print}' "$changelog" \
  | gh release create --verify-tag --title "$title" --notes-file - "v${version}"
