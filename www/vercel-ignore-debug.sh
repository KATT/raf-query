# Test-only (#161): run the ignore step and publish its output with the deployment.
{
	env | grep '^VERCEL_GIT' | grep -v MESSAGE | sort
	sh ../tooling/vercel-ignore/ignore.sh
	echo $? > /tmp/ignore-code
	echo "ignore exit $(cat /tmp/ignore-code)"
} > public/vercel-ignore.log 2>&1
cat public/vercel-ignore.log
[ "$(cat /tmp/ignore-code)" = 0 ] && exit 0
exit 1
