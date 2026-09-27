import { writeFile, rename, rm } from 'node:fs/promises';

// A failed validation or interrupted write must leave the previous catalogue intact.
export async function publishPresets(path, data, problems = []) {
  if (problems.length) throw new Error(`Preset validation failed; existing data kept:\n - ${problems.join('\n - ')}`);
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(data));
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
