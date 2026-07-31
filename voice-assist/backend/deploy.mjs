// Code deploy for the AI Assist Voice Lambda (mr-sparky-ai-assist).
// Same raw-zip technique as Henri's deploy.mjs (forward-slash entries — Windows
// Compress-Archive writes backslashes that mangle on the Linux runtime).
// Usage: node deploy.mjs        update function code
//        node deploy.mjs zip    just build function.zip (for initial create)
import { execSync, execFileSync } from "node:child_process";
import fs from "node:fs";

const FUNCTION = "mr-sparky-ai-assist";
const REGION = "ap-southeast-2";
const ZIP = "function.zip";
const FILES = ["index.mjs", "brain.mjs"];

// Pre-flight: the app page's inline <script> lives in a template literal that
// node --check never parses — parse it for real (lesson from Henri's dashboard).
await import("./index.mjs").catch((e) => {
  // @aws-sdk/* ships inside the Lambda runtime — absent locally, that's fine.
  if (/@aws-sdk/.test(e.message)) {
    console.log("Pre-flight: skipping import check (@aws-sdk provided by runtime).");
    return {};
  }
  console.error("❌ index.mjs failed to import:", e.message);
  process.exit(1);
});
const src = fs.readFileSync("index.mjs", "utf8");
const htmlMatch = src.match(/const APP_HTML = `([\s\S]*)`;\s*$/);
if (htmlMatch) {
  const scriptMatch = htmlMatch[1].match(/<script(?: type="module")?>([\s\S]*)<\/script>/);
  if (scriptMatch) {
    try {
      // Strip top-level import lines — new Function can't hold them, but the
      // rest of the module body still parses (the point of this check).
      const bodyJs = scriptMatch[1].replace(/^\s*import [^\n]*\n/gm, "");
      new Function(bodyJs.replace(/\\n/g, "\n").replace(/\\u/g, "\\u").replace(/\\\\/g, "\\"));
      console.log("Pre-flight: app page script parses OK.");
    } catch (err) {
      console.error("❌ DEPLOY BLOCKED — app page script broken:", err.message);
      process.exit(1);
    }
  }
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

const chunks = [], central = [];
let offset = 0;
for (const name of FILES) {
  const data = fs.readFileSync(name);
  const crc = crc32(data);
  const nameBuf = Buffer.from(name, "utf8");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  chunks.push(local, nameBuf, data);
  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0);
  cen.writeUInt16LE(20, 4);
  cen.writeUInt16LE(20, 6);
  cen.writeUInt32LE(crc, 16);
  cen.writeUInt32LE(data.length, 20);
  cen.writeUInt32LE(data.length, 24);
  cen.writeUInt16LE(nameBuf.length, 28);
  cen.writeUInt32LE(offset, 42);
  central.push(cen, nameBuf);
  offset += local.length + nameBuf.length + data.length;
}
const centralBuf = Buffer.concat(central);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(FILES.length, 8);
eocd.writeUInt16LE(FILES.length, 10);
eocd.writeUInt32LE(centralBuf.length, 12);
eocd.writeUInt32LE(offset, 16);
fs.writeFileSync(ZIP, Buffer.concat([...chunks, centralBuf, eocd]));
console.log(`Built ${ZIP} (${(fs.statSync(ZIP).size / 1024).toFixed(0)} KB)`);

if (process.argv[2] === "zip") process.exit(0);

execFileSync("aws", ["lambda", "update-function-code", "--function-name", FUNCTION, "--region", REGION, "--zip-file", `fileb://${ZIP}`], { stdio: ["ignore", "ignore", "inherit"] });
execSync(`aws lambda wait function-updated --function-name ${FUNCTION} --region ${REGION}`, { stdio: "inherit" });
console.log("✅ Deployed and active.");
