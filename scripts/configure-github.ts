#!/usr/bin/env node
/**
 * Apply the GitHub repo settings that live outside git: squash-only merges and
 * the `main` branch ruleset. Idempotent. Run with an admin `gh` login:
 *
 *   node scripts/configure-github.ts
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

const RULESET_NAME = "Branch protection for main";

// Job names from .github/workflows/ci.yaml.
const REQUIRED_CHECKS = [
	"Build",
	"Engines Check",
	"Format Check",
	"Lint",
	"Test",
	"Type Check",
];

// Repository role 5 is "admin". The release workflow pushes `chore: release
// vX.Y.Z` straight to main with the owner's ACCESS_TOKEN, so admins bypass.
const ADMIN_ROLE_ID = 5;

const repoSettings = {
	allow_merge_commit: false,
	allow_rebase_merge: false,
	allow_squash_merge: true,
	delete_branch_on_merge: true,
	// release-it builds CHANGELOG.md from commit subjects, so the squash
	// commit takes the (conventional) PR title.
	squash_merge_commit_message: "PR_BODY",
	squash_merge_commit_title: "PR_TITLE",
};

const ruleset = {
	bypass_actors: [
		{
			actor_id: ADMIN_ROLE_ID,
			actor_type: "RepositoryRole",
			bypass_mode: "always",
		},
	],
	conditions: { ref_name: { exclude: [], include: ["refs/heads/main"] } },
	enforcement: "active",
	name: RULESET_NAME,
	rules: [
		{ type: "deletion" },
		{ type: "non_fast_forward" },
		{
			parameters: {
				allowed_merge_methods: ["squash"],
				dismiss_stale_reviews_on_push: false,
				require_code_owner_review: false,
				require_last_push_approval: false,
				required_approving_review_count: 0,
				required_review_thread_resolution: false,
			},
			type: "pull_request",
		},
		{
			parameters: {
				required_status_checks: REQUIRED_CHECKS.map((context) => ({ context })),
				strict_required_status_checks_policy: false,
			},
			type: "required_status_checks",
		},
	],
	target: "branch",
};

Effect.gen(function* () {
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

	const gh = (args: ReadonlyArray<string>) =>
		spawner
			.string(ChildProcess.make("gh", args, { stderr: "inherit" }))
			.pipe(Effect.map((out) => out.trim()));

	const ghWrite = Effect.fnUntraced(function* (
		method: string,
		endpoint: string,
		body: unknown,
	) {
		const stdin = Stream.make(new TextEncoder().encode(JSON.stringify(body)));
		const command = ChildProcess.make(
			"gh",
			["api", "--method", method, endpoint, "--input", "-", "--silent"],
			{
				stderr: "inherit",
				stdin,
				stdout: "inherit",
			},
		);
		const code = yield* spawner.exitCode(command);
		if (code !== 0) {
			return yield* Effect.fail(
				new Error(`gh api --method ${method} ${endpoint} exited with ${code}`),
			);
		}
	});

	const repo = yield* gh([
		"repo",
		"view",
		"--json",
		"nameWithOwner",
		"--jq",
		".nameWithOwner",
	]);

	yield* ghWrite("PATCH", `repos/${repo}`, repoSettings);
	yield* Console.log(`${repo}: squash merges only, delete branch on merge`);

	const existingId = yield* gh([
		"api",
		`repos/${repo}/rulesets`,
		"--jq",
		`map(select(.name == ${JSON.stringify(RULESET_NAME)})) | first | .id // empty`,
	]);
	if (existingId) {
		yield* ghWrite("PUT", `repos/${repo}/rulesets/${existingId}`, ruleset);
	} else {
		yield* ghWrite("POST", `repos/${repo}/rulesets`, ruleset);
	}
	yield* Console.log(
		`${repo}: ruleset "${RULESET_NAME}" ${existingId ? "updated" : "created"}`,
	);
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
