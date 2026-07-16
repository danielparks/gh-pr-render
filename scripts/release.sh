#!/bin/bash

# To make a release:
#
# ❯ scripts/release.sh 1.2.3 'Big bug fixed'
# ❯ gh pr create -w
# # ... merge PR into main
# ❯ scripts/publish-release.sh

set -eo pipefail
shopt -s extglob

version=$1
shift

title="$version"
if [[ -n "$*" ]] ; then
  title="${title}: ${*}"
fi

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

branch-name () {
  git rev-parse --abbrev-ref HEAD
}

case $version in
  +([0-9]).+([0-9]).+([0-9])*) ;; # Good
  *) echo "Usage $0 VERSION [TITLE]" >&2 ; exit 1 ;;
esac

command -v parse-changelog &>/dev/null || {
  echo "parse-changelog not installed (https://github.com/taiki-e/parse-changelog)" >&2
  exit 1
}

check-changes

echo 'Making sure version is correct.'

awk-in-place package.json '
  /^ *"version": *"[0-9.]+"/ && !done {
    sub(/"[0-9.]+"/, "\"'$version'\"")
    done=1
  }
  { print }'

npm install

awk-in-place CHANGELOG.md '
  /^## main/ && !done {
    $0 = "## Release '$version' ('$(date +%Y-%m-%d)')"
    done=1
  }
  { print }'

check-changes &>/dev/null && {
  echo "Version already ${version}. Use scripts/publish-release.sh to publish."
  exit 0
}

# Commit version bump
if [[ "$(branch-name)" = main ]] ; then
  # Conveniently, this usually won’t create a branch on jj repos.
  git switch -c "release-$version"
fi
git add -u
git status
git commit --cleanup=verbatim --file - <<EOF
Release ${title}

$(parse-changelog CHANGELOG.md "$version")
EOF

echo
echo 'Merge changes into main, then run scripts/publish-release.sh'
