import jsonfile from "jsonfile";
import moment from "moment";
import simpleGit from "simple-git";
import random from "random";

// ─── Configuration ────────────────────────────────────────────────────────────
const FILE_PATH = "./data.json";
const TOTAL_COMMITS = 100;  // Total number of commits to make
const WEEKS_BACK = 52;      // How many weeks back to spread commits (max 52 = 1 year)
// ──────────────────────────────────────────────────────────────────────────────

const git = simpleGit();

/**
 * Recursively creates backdated commits until n reaches 0, then pushes.
 */
const makeCommits = async (n) => {
  if (n === 0) {
    console.log("\n✅ All commits done! Pushing to remote...");
    await git.push();
    console.log("🚀 Push complete.");
    return;
  }

  // Pick a random week and day offset within the past year
  const weeksOffset = random.int(0, WEEKS_BACK);
  const daysOffset  = random.int(0, 6);

  const commitDate = moment()
    .subtract(1, "y")
    .add(1, "d")
    .add(weeksOffset, "w")
    .add(daysOffset, "d")
    .format();

  const data = { date: commitDate };

  console.log(`📝 Commit ${TOTAL_COMMITS - n + 1}/${TOTAL_COMMITS} — ${commitDate}`);

  await jsonfile.writeFile(FILE_PATH, data);
  await git.add([FILE_PATH]);
  await git.commit(commitDate, { "--date": commitDate });

  await makeCommits(n - 1);
};

// ─── Entry point ──────────────────────────────────────────────────────────────
console.log(`🌱 goGreen — generating ${TOTAL_COMMITS} backdated commits...\n`);
makeCommits(TOTAL_COMMITS).catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
