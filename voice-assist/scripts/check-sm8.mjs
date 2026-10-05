/**
 * ServiceM8 verification — read-only, run from the PC in PowerShell:
 *
 *   node voice-assist/scripts/check-sm8.mjs
 *
 * Answers the four questions the 14 August changeover still needs:
 *
 *   1. STAFF — every staff member's name + UUID (for portal settings, so
 *      attribution matches on UUID instead of drifting names).
 *   2. FORMS — every form's name + UUID (we need the JSA's uuid to switch
 *      compliance on; Form 001's should match the one already in code).
 *   3. COMPLETION — who completion_actioned_by resolves to on the 40 most
 *      recent completed jobs. The whole new model hangs on this being the
 *      tech, never an office login. Here is where we find out.
 *   4. TASKS — the raw fields on checklist items for a job that has some
 *      ticked and some not, so we learn which field a tick flips and
 *      whether unticking leaves a trace.
 *
 * Nothing is written to ServiceM8 — GET requests only. The API key is pulled
 * from the Lambda's own configuration via the AWS CLI (same auth the deploy
 * script uses), so nothing is pasted or stored.
 *
 * Needs: Node 18+ (for fetch) and the AWS CLI signed in — both already true
 * on the deploy PC.
 */
import { execFileSync } from 'node:child_process';

const CLI = process.platform === 'win32'
  ? (process.env.AWS_CLI_PATH || 'C:\\Program Files\\Amazon\\AWSCLIV2\\aws.exe')
  : 'aws';

function keyFromLambda() {
  const out = execFileSync(CLI, [
    'lambda', 'get-function-configuration',
    '--function-name', 'mr-sparky-ai-assist', '--region', 'ap-southeast-2',
    '--query', 'Environment.Variables.SM8_API_KEY', '--output', 'text',
  ], { encoding: 'utf8' }).trim();
  if (!out || out === 'None') throw new Error('SM8_API_KEY not found on the Lambda');
  return out;
}

const KEY = keyFromLambda();

async function sm8(path) {
  const res = await fetch(`https://api.servicem8.com/api_1.0/${path}`, {
    headers: { 'X-Api-Key': KEY, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

const line = (s) => console.log(s);
const rule = (t) => line(`\n===== ${t} =====`);

/* ---- 1. Staff: name -> uuid ---- */
const staff = await sm8('staff.json');
const staffName = Object.fromEntries(staff.map((s) => [s.uuid, `${s.first || ''} ${s.last || ''}`.trim()]));
rule('STAFF (paste the subbies\' UUIDs into portal settings as sm8StaffUuid)');
for (const s of staff) {
  line(`${String(s.active) === '1' ? 'active  ' : 'INACTIVE'}  ${s.uuid}  ${staffName[s.uuid]}`);
}

/* ---- 2. Forms: name -> uuid ---- */
const forms = await sm8('form.json');
rule('FORMS (the JSA uuid goes into settings.compliance.jsaFormUuid)');
for (const f of forms) {
  line(`${String(f.active) === '1' ? 'active  ' : 'INACTIVE'}  ${f.uuid}  ${f.name}`);
}

/* ---- 3. completion_actioned_by on recent completed jobs ---- */
const jobs = await sm8("job.json?%24filter=status%20eq%20'Completed'&%24top=200");
const recent = jobs
  .filter((j) => j.completion_date && j.completion_date !== '0000-00-00 00:00:00')
  .sort((a, b) => (a.completion_date < b.completion_date ? 1 : -1))
  .slice(0, 40);
rule('COMPLETION — who marked the last 40 jobs complete');
const tally = {};
let sampleShown = false;
for (const j of recent) {
  const u = j.completion_actioned_by_uuid || j.completion_actioned_by || '';
  const who = staffName[u] || (u ? `(unknown ${String(u).slice(0, 8)})` : '(blank)');
  tally[who] = (tally[who] || 0) + 1;
  if (!sampleShown) {
    line('fields on a completed job that mention completion/actioned:');
    for (const k of Object.keys(j).filter((k) => /complet|actioned/i.test(k))) {
      line(`  ${k} = ${JSON.stringify(j[k])}`);
    }
    sampleShown = true;
  }
}
line('');
for (const [who, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
  line(`${String(n).padStart(4)}  ${who}`);
}
line('\nIf any office name appears above, say so in the chat — the attribution');
line('design assumes techs complete their own jobs.');

/* ---- 4. Task fields, ticked vs not ---- */
rule('TASKS — raw fields, so we learn what a tick changes');
const tasks = await sm8('task.json?%24top=25');
const rows = Array.isArray(tasks) ? tasks : [];
if (!rows.length) {
  line('No tasks returned.');
} else {
  line(`fields present: ${Object.keys(rows[0]).join(', ')}\n`);
  for (const t of rows.slice(0, 12)) {
    const bits = Object.entries(t)
      .filter(([k]) => /uuid|name|complet|active|done|checked|status|edit_date|staff/i.test(k))
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`);
    line(`- ${bits.join('  ')}`);
  }
}

line('\nDone. Copy this whole output and paste it into the Claude Code chat.');
