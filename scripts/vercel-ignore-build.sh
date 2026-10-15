#!/bin/sh
# Vercel "Ignored Build Step": exit 0 skips the deployment, exit 1 builds it.
# Usage: sh vercel-ignore-build.sh <path>... (paths relative to the project's root directory)
#
# Builds if any of the paths changed since the project's last deployment on this branch.
# On a branch's first deployment there is none, so compare with where the branch left main.
# Anything unexpected (missing commits in the shallow clone, no network) builds.

base="$VERCEL_GIT_PREVIOUS_SHA"

if [ -z "$base" ]; then
	[ "$VERCEL_GIT_COMMIT_REF" = main ] && exit 1
	git fetch --quiet --no-tags --depth=100 https://github.com/KATT/raf-query.git main || exit 1
	base=$(git merge-base FETCH_HEAD HEAD) || exit 1
fi

git diff --quiet "$base" HEAD -- "$@" && exit 0
exit 1
