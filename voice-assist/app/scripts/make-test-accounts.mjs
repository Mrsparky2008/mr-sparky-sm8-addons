/**
 * Two throwaway applicant accounts, for the App Store review round.
 *
 *   node scripts/make-test-accounts.mjs
 *
 * Why two: one gets DELETED while filming the account-deletion flow Apple asked
 * to see, and the other is the login handed to the reviewer. Give Apple the one
 * you delete on camera and they are locked out — which is another week gone.
 *
 * The mobiles are 0491 570 156 and 157. ACMA reserves 0491 570 156-158 for
 * fiction and testing and never allocates them, so these records cannot collide
 * with a real applicant's number.
 *
 * Safe to run twice: an existing Cognito user is reused rather than failing.
 *
 * Needs AWS credentials — that means Steven's PC.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';

const TABLE = 'mr-sparky-portal';
const POOL = 'us-east-1_xOJ0DPHK6';
const REGION = 'us-east-1';
const now = new Date().toISOString();

const ACCOUNTS = [
  {
    email: 'test.applicant@mrsparky.com.au',
    mobile: '+61491570156',
    name: 'Test Applicant',
    password: 'SparkyTest#2026aQ',
    why: 'yours — delete this one on camera',
  },
  {
    email: 'appreview@mrsparky.com.au',
    mobile: '+61491570157',
    name: 'App Review',
    password: 'AppleReview#2026kD',
    why: 'give this one to Apple — do NOT delete it',
  },
];

const aws = (args) =>
  execFileSync('aws', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

for (const a of ACCOUNTS) {
  // The applicant record. stage 'demo' and mobileVerified are what the app and
  // /api/demo/earnings actually gate on — everything else here is shape.
  const item = {
    pk: { S: `APPLICANT#${a.mobile}` },
    sk: { S: 'PROFILE' },
    id: { S: `AP-${now.slice(0, 10)}-TEST${a.mobile.slice(-3)}` },
    name: { S: a.name },
    mobile: { S: a.mobile },
    email: { S: a.email },
    licenceNumber: { S: '184060C' },
    promoCode: { NULL: true },
    licence: { NULL: true },
    business: { NULL: true },
    stage: { S: 'demo' },
    mobileVerified: { BOOL: true },
    loginCreated: { BOOL: true },
    loginCreatedAt: { S: now },
    attempts: { N: '0' },
    sends: { L: [] },
    // So these are obvious in the admin list and easy to sweep up later.
    isTestAccount: { BOOL: true },
    createdAt: { S: now },
    updatedAt: { S: now },
  };

  writeFileSync('item.tmp.json', JSON.stringify(item));
  aws(['dynamodb', 'put-item', '--table-name', TABLE, '--region', REGION,
    '--item', 'file://item.tmp.json']);
  unlinkSync('item.tmp.json');

  try {
    aws(['cognito-idp', 'admin-create-user', '--user-pool-id', POOL, '--region', REGION,
      '--username', a.email, '--message-action', 'SUPPRESS',
      '--user-attributes', `Name=email,Value=${a.email}`, 'Name=email_verified,Value=true']);
  } catch (e) {
    // Already there is fine — the password is set below either way.
    if (!String(e.stderr || '').includes('UsernameExistsException')) throw e;
    console.log(`   (login already existed, reusing it)`);
  }

  aws(['cognito-idp', 'admin-set-user-password', '--user-pool-id', POOL, '--region', REGION,
    '--username', a.email, '--password', a.password, '--permanent']);

  console.log(`\n${a.email}`);
  console.log(`   password : ${a.password}`);
  console.log(`   ${a.why}`);
}

console.log('\nSign in with either one. You should land on the earnings screen.');
console.log('The account sheet is behind your email, top right.\n');
