import jsonfile  from "jsonfile";
import moment    from "moment";
import { simpleGit } from "simple-git";
import random    from "random";

// ─── Configuration ────────────────────────────────────────────────────────────
const FILE_PATH  = "./data.json";
const DAYS_BACK  = 365;   // Fill this many past days
const MIN_PER_DAY = 3;    // Minimum commits per day  (1–3 = light green)
const MAX_PER_DAY = 10;   // Maximum commits per day  (9+  = darkest green)
// ──────────────────────────────────────────────────────────────────────────────

const git = simpleGit();

const makeCommits = async () => {
  let totalCommits = 0;

  for (let day = DAYS_BACK; day >= 0; day--) {
    const commitsToday = random.int(MIN_PER_DAY, MAX_PER_DAY);
    const baseDate = moment().subtract(day, "d");

    for (let c = 0; c < commitsToday; c++) {
      // Vary the hour/minute so commits on the same day look natural
      const commitDate = baseDate
        .clone()
        .hour(random.int(8, 22))
        .minute(random.int(0, 59))
        .second(random.int(0, 59))
        .format();

      await jsonfile.writeFile(FILE_PATH, { date: commitDate });
      await git.add([FILE_PATH]);
      await git.commit(commitDate, { "--date": commitDate });
      totalCommits++;
    }

    const pct = (((DAYS_BACK - day) / DAYS_BACK) * 100).toFixed(0);
    process.stdout.write(
      `\r🟩 Day ${DAYS_BACK - day + 1}/${DAYS_BACK + 1}  ` +
      `commits today: ${commitsToday}  ` +
      `total: ${totalCommits}  [${pct}%]   `
    );
  }

  console.log(`\n\n✅ Done! ${totalCommits} commits created across ${DAYS_BACK + 1} days.`);
  console.log("🚀 Pushing to remote...");
  await git.push(["--force"]);
  console.log("✅ Push complete.");
};

// ─── Entry point ─────────────────────────────────────────────────────────────
console.log(`🌱 goGreen — filling ${DAYS_BACK + 1} days (${MIN_PER_DAY}–${MAX_PER_DAY} commits/day)\n`);
makeCommits().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});

