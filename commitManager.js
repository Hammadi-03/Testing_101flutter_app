#!/usr/bin/env node
/**
 * commitManager.js — goGreen Commit Manager
 *
 * Usage:
 *   node commitManager.js run    [--count=100] [--weeks=52] [--push]
 *   node commitManager.js dry    [--count=100] [--weeks=52]
 *   node commitManager.js status
 *   node commitManager.js log    [--limit=10]
 *   node commitManager.js reset  [--hard]
 *
 * Flags:
 *   --count=N    Number of commits to generate  (default: 100)
 *   --weeks=N    How many weeks back to spread   (default: 52)
 *   --push       Push to remote after commits    (default: true for run)
 *   --hard       In reset: remove all local commits not on remote
 *   --limit=N    Sessions to show in log view    (default: 10)
 */

import jsonfile  from "jsonfile";
import moment    from "moment";
import { simpleGit } from "simple-git";
import random    from "random";
import chalk     from "chalk";
import ora       from "ora";
import minimist  from "minimist";

// ─── Parse CLI args ──────────────────────────────────────────────────────────
const argv = minimist(process.argv.slice(2), {
  default: { count: 100, weeks: 52, push: true, hard: false },
  alias:   { c: "count", w: "weeks", p: "push" },
});

const [command = "run"] = argv._;
const TOTAL_COMMITS = Number(argv.count);
const WEEKS_BACK    = Number(argv.weeks);
const SHOULD_PUSH   = argv.push !== "false" && argv.push !== false;

const FILE_PATH = "./data.json";
const LOG_PATH  = "./commitLog.json";
const git       = simpleGit();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a random backdated ISO date string within the configured range. */
const randomBackdate = () =>
  moment()
    .subtract(1, "y")
    .add(1, "d")
    .add(random.int(0, WEEKS_BACK), "w")
    .add(random.int(0, 6),          "d")
    .format();

/** Print a styled section header. */
const header = (text) =>
  console.log("\n" + chalk.bold.green("●") + " " + chalk.bold.white(text));

/**
 * Read commitLog.json, returning a default structure if missing/corrupt.
 */
async function readLog() {
  try {
    return await jsonfile.readFile(LOG_PATH);
  } catch {
    return {
      meta: {
        project: "goGreen",
        repository: "https://github.com/fenrir2608/goGreen",
        createdAt: moment().toISOString(),
        lastUpdated: null,
        totalSessions: 0,
        totalCommits: 0,
      },
      sessions: [],
    };
  }
}

/**
 * Persist the log object back to commitLog.json.
 */
async function saveLog(log) {
  await jsonfile.writeFile(LOG_PATH, log, { spaces: 2 });
}

// ─── Commands ────────────────────────────────────────────────────────────────

/**
 * run: Generate N backdated commits and optionally push.
 */
async function cmdRun() {
  header(`goGreen Commit Manager — generating ${TOTAL_COMMITS} commits`);
  console.log(chalk.dim(`  spread over the past ${WEEKS_BACK} weeks\n`));

  const bar = ora({ text: "Starting…", color: "green" }).start();

  // ── Session record that will be appended to commitLog.json ──
  const session = {
    sessionId:   `session-${Date.now()}`,
    startedAt:   moment().toISOString(),
    finishedAt:  null,
    count:       TOTAL_COMMITS,
    weeksBack:   WEEKS_BACK,
    pushed:      false,
    timestamps:  [],
  };

  for (let i = 0; i < TOTAL_COMMITS; i++) {
    const date = randomBackdate();
    bar.text = chalk.cyan(`Commit ${i + 1}/${TOTAL_COMMITS}`) +
               chalk.dim(`  ${date}`);

    await jsonfile.writeFile(FILE_PATH, { date });
    await git.add([FILE_PATH]);
    await git.commit(date, { "--date": date });

    session.timestamps.push(date);
  }

  bar.succeed(chalk.green(`${session.timestamps.length} commits created.`));

  if (SHOULD_PUSH) {
    const pushSpinner = ora("Pushing to remote…").start();
    try {
      await git.push();
      session.pushed = true;
      pushSpinner.succeed(chalk.green("Pushed to remote successfully."));
    } catch (err) {
      pushSpinner.fail(chalk.red(`Push failed: ${err.message}`));
    }
  } else {
    console.log(chalk.yellow("\n  ⚠  Skipped push (--push=false)"));
  }

  // ── Persist session to commitLog.json ──
  session.finishedAt = moment().toISOString();
  const log = await readLog();
  log.sessions.push(session);
  log.meta.lastUpdated   = session.finishedAt;
  log.meta.totalSessions = log.sessions.length;
  log.meta.totalCommits  = log.sessions.reduce((s, r) => s + r.timestamps.length, 0);
  await saveLog(log);

  console.log(chalk.dim(`\n  📄 Session saved → commitLog.json (session #${log.meta.totalSessions})\n`));
}

/**
 * dry: Preview commits without writing anything.
 */
async function cmdDry() {
  header(`DRY RUN — ${TOTAL_COMMITS} commits (nothing will be written)`);
  console.log(chalk.dim(`  spread over the past ${WEEKS_BACK} weeks\n`));

  const dates = Array.from({ length: TOTAL_COMMITS }, randomBackdate).sort();

  dates.forEach((d, i) => {
    const label = chalk.dim(`  [${String(i + 1).padStart(3)}]`);
    console.log(`${label}  ${chalk.cyan(d)}`);
  });

  console.log(
    "\n" +
    chalk.yellow("→ Run ") +
    chalk.bold("node commitManager.js run") +
    chalk.yellow(" to apply these commits.\n")
  );
}

/**
 * status: Show current git status and recent commits.
 */
async function cmdStatus() {
  header("Repository Status");

  const [log, status] = await Promise.all([
    git.log({ maxCount: 10 }),
    git.status(),
  ]);

  // Branch info
  console.log(chalk.bold("\n  Branch : ") + chalk.cyan(status.current));
  console.log(
    chalk.bold("  Ahead  : ") +
    (status.ahead > 0 ? chalk.yellow(status.ahead + " commit(s) ahead of remote") : chalk.dim("up to date"))
  );

  // Staged / modified
  if (status.staged.length || status.modified.length || status.not_added.length) {
    console.log(chalk.bold("\n  Changes:"));
    status.staged   .forEach((f) => console.log(chalk.green  (`    ✚  ${f} (staged)`)));
    status.modified .forEach((f) => console.log(chalk.yellow (`    ✎  ${f} (modified)`)));
    status.not_added.forEach((f) => console.log(chalk.dim    (`    ?  ${f} (untracked)`)));
  } else {
    console.log(chalk.dim("\n  Working tree clean."));
  }

  // Recent commits
  console.log(chalk.bold("\n  Last 10 commits:"));
  log.all.forEach(({ hash, date, message }) => {
    console.log(
      chalk.dim(`    ${hash.slice(0, 7)}`) +
      "  " + chalk.cyan(date.slice(0, 10)) +
      "  " + chalk.white(message.slice(0, 60))
    );
  });

  console.log();
}

/**
 * reset: Soft-reset the last N commits (or hard-reset with --hard).
 */
async function cmdReset() {
  if (argv.hard) {
    header("Hard Reset — reverting to remote HEAD");
    const spinner = ora("Fetching remote and resetting…").start();
    try {
      await git.fetch();
      await git.reset(["--hard", "origin/HEAD"]);
      spinner.succeed(chalk.green("Hard reset complete."));
    } catch (err) {
      spinner.fail(chalk.red(err.message));
    }
  } else {
    header(`Soft Reset — removing last ${TOTAL_COMMITS} local commits`);
    const spinner = ora("Resetting…").start();
    try {
      await git.reset(["--soft", `HEAD~${TOTAL_COMMITS}`]);
      spinner.succeed(chalk.green(`Soft-reset ${TOTAL_COMMITS} commits (changes kept staged).`));
      console.log(
        chalk.dim(`  Run `) +
        chalk.bold("git push --force") +
        chalk.dim(" to update the remote if needed.\n")
      );
    } catch (err) {
      spinner.fail(chalk.red(err.message));
    }
  }
}

/**
 * log: Display commit history stored in commitLog.json.
 */
async function cmdLog() {
  const log   = await readLog();
  const limit = Number(argv.limit ?? 10);

  header("Commit Log — commitLog.json");

  // Meta summary
  console.log(chalk.bold("\n  Project    : ") + chalk.cyan(log.meta.project));
  console.log(chalk.bold("  Repository : ") + chalk.dim(log.meta.repository));
  console.log(chalk.bold("  Created    : ") + chalk.dim(log.meta.createdAt));
  console.log(chalk.bold("  Updated    : ") + chalk.dim(log.meta.lastUpdated ?? "never"));
  console.log(
    chalk.bold("  Totals     : ") +
    chalk.yellow(log.meta.totalCommits + " commits") +
    chalk.dim(" across ") +
    chalk.yellow(log.meta.totalSessions + " session(s)")
  );

  if (log.sessions.length === 0) {
    console.log(chalk.dim("\n  No sessions recorded yet. Run `node commitManager.js run` first.\n"));
    return;
  }

  // Session list (most recent first)
  const sessions = [...log.sessions].reverse().slice(0, limit);
  console.log(chalk.bold(`\n  Last ${sessions.length} session(s) (newest first):\n`));

  sessions.forEach((s, idx) => {
    const duration = s.finishedAt
      ? moment(s.finishedAt).diff(moment(s.startedAt), "seconds") + "s"
      : "—";

    console.log(
      chalk.bold.green(`  ┌─ Session #${log.meta.totalSessions - idx}`) +
      chalk.dim(` (${s.sessionId})`)
    );
    console.log(chalk.dim(`  │  Started   : `) + chalk.white(s.startedAt));
    console.log(chalk.dim(`  │  Finished  : `) + chalk.white(s.finishedAt ?? "—"));
    console.log(chalk.dim(`  │  Duration  : `) + chalk.white(duration));
    console.log(chalk.dim(`  │  Commits   : `) + chalk.cyan(s.timestamps.length));
    console.log(chalk.dim(`  │  Weeks back: `) + chalk.cyan(s.weeksBack));
    console.log(chalk.dim(`  │  Pushed    : `) + (s.pushed ? chalk.green("yes") : chalk.yellow("no")));

    // Show first 3 and last 3 timestamps as a sample
    const ts = s.timestamps;
    const sample = ts.length <= 6
      ? ts
      : [...ts.slice(0, 3), "…", ...ts.slice(-3)];
    console.log(chalk.dim(`  │  Timestamps (sample):`) );
    sample.forEach((t) =>
      console.log(chalk.dim("  │    ") + (t === "…" ? chalk.dim("  … ("+( ts.length - 6)+" more) …") : chalk.cyan(t)))
    );
    console.log(chalk.dim("  └" + "─".repeat(50)));
    console.log();
  });

  if (log.sessions.length > limit) {
    console.log(chalk.dim(`  … and ${log.sessions.length - limit} older session(s). Use --limit=N to see more.\n`));
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────

const COMMANDS = { run: cmdRun, dry: cmdDry, status: cmdStatus, log: cmdLog, reset: cmdReset };

if (!COMMANDS[command]) {
  console.error(chalk.red(`\nUnknown command: "${command}"`));
  console.log(`\nAvailable commands: ${Object.keys(COMMANDS).join(", ")}\n`);
  process.exit(1);
}

COMMANDS[command]().catch((err) => {
  console.error(chalk.red("\n❌ Fatal error:"), err.message);
  process.exit(1);
});
