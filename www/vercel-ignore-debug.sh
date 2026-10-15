# Test-only (#161): run the ignore step and publish its output with the deployment.
{
	pnpm install --frozen-lockfile --prod --ignore-scripts --filter @tooling/vercel-ignore
	echo "install exit $?"
	node -v
	env | grep '^VERCEL_GIT' | grep -v MESSAGE | sort
	node ../tooling/vercel-ignore/src/bin/ignore.ts
	echo $? > /tmp/ignore-code
	echo "ignore exit $(cat /tmp/ignore-code)"
} > public/vercel-ignore.log 2>&1
cat public/vercel-ignore.log
[ "$(cat /tmp/ignore-code)" = 0 ] && exit 0
exit 1
