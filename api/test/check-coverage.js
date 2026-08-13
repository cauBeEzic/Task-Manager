const { spawnSync } = require('node:child_process');

const result = spawnSync(
  process.execPath,
  ['--experimental-test-coverage', '--test', 'test/idempotency.test.js', 'test/model-validation.test.js'],
  { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, TMPDIR: '/tmp' } }
);

process.stdout.write(result.stdout);
process.stderr.write(result.stderr);

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status || 1);
}

const requiredFiles = [
  'db/models/action-receipt.model.js',
  'db/models/task.model.js',
  'idempotency.js'
];
const rows = new Map(
  result.stdout
    .split('\n')
    .filter(line => line.startsWith('# ') && line.includes(' | '))
    .map(line => {
      const [file, lines, branches, functions] = line.slice(2).split(' | ');
      return [file, [lines, branches, functions]];
    })
);

for (const file of requiredFiles) {
  const metrics = rows.get(file);
  if (!metrics || metrics.some(metric => Number.parseFloat(metric) !== 100)) {
    console.error(`Coverage threshold failed for ${file}: ${metrics?.join(' / ') || 'missing'}`);
    process.exit(1);
  }
}

console.log('Critical backend modules: 100% lines, branches, and functions.');
