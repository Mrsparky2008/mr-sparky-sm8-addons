// ServiceM8 Simple Function Add-on: "AI Assist"
// Smart admin/scheduling chat assistant on the job card.
// Backend: https://webchat.mrsparky.com.au/assist (Henri's Lambda, handlers/assist.mjs).
// Backup: github.com/Mrsparky2008/mr-sparky-sm8-addons
//
// SM8 runtime notes (Node 24): async handler, return { eventResponse: html }.
// Page structure intentionally mirrors servicem8/addon-sdk-samples showcase-addon.

'use strict';

var BACKEND_URL = 'https://webchat.mrsparky.com.au/assist';

function jsEmbed(value) {
  return JSON.stringify(String(value || '')).replace(/</g, '\\u003c');
}

function errorPage(msg) {
  var safe = String(msg || 'Unknown error').replace(/[&<>]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
  });
  return {
    eventResponse: '<html><head><meta charset="utf-8"></head>' +
      '<body style="font-family:sans-serif;margin:24px"><h3>AI Assist could not start</h3><p>' + safe +
      '</p><p>Close this window and try again from the job card.</p></body></html>'
  };
}

// Chat relay: the popup page cannot fetch external domains directly (SM8's
// frame CSP blocks it), so the page uses client.invoke() -> this event -> we
// call the backend SERVER-SIDE (no CSP here) and hand the reply back.
async function chatRelay(event) {
  try {
    var token = event && event.auth && event.auth.accessToken;
    var args = (event && event.eventArgs) || {};
    var res = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: token,
        jobUUID: args.jobUUID,
        messages: Array.isArray(args.messages) ? args.messages : []
      })
    });
    var text = await res.text();
    console.log('AI Assist chat relay | backend HTTP', res.status, '| bytes', text.length);
    // Pass the backend JSON straight through; the page parses it.
    return { eventResponse: text };
  } catch (e) {
    console.log('AI Assist chat relay FAILED:', e && e.message);
    return { eventResponse: JSON.stringify({ ok: false, error: 'Relay failed: ' + (e && e.message) }) };
  }
}

// The app deep-links by JOB NUMBER (that is what its screens and the brain
// speak), but the add-on is handed a UUID. Resolve it here, server-side, where
// the temp OAuth token works and there is no frame CSP in the way.
async function jobNumberFor(uuid, token) {
  try {
    var res = await fetch('https://api.servicem8.com/api_1.0/job/' + encodeURIComponent(uuid) + '.json', {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }
    });
    if (!res.ok) { console.log('AI Assist: job lookup HTTP', res.status); return ''; }
    var job = await res.json();
    return String((job && job.generated_job_id) || '');
  } catch (e) {
    console.log('AI Assist: job lookup failed:', e && e.message);
    return '';
  }
}

exports.handler = async (event) => {
  try {
    var token = event && event.auth && event.auth.accessToken;
    var jobUUID = event && event.eventArgs && event.eventArgs.jobUUID;
    console.log('AI Assist v5.1 invoked | event:', event && event.eventName, '| token:', !!token, '| job:', jobUUID || '(none)');

    if (event && event.eventName === 'ai_assist_chat') {
      return chatRelay(event);
    }

    if (!token || !jobUUID) {
      return errorPage('Missing session token or job — open a Job Card and click AI Assist again.');
    }

    var jobNumber = await jobNumberFor(jobUUID, token);

    var html = `
<html>
	<head>
		<meta charset="utf-8">
		<link rel="stylesheet" href="https://platform.servicem8.com/sdk/1.0/sdk.css">
		<script src="https://platform.servicem8.com/sdk/1.0/sdk.js"></script>
		<style>
			#aihead{background:#1a73e8;color:#fff;padding:10px 14px;font-weight:bold;font-size:15px;border-radius:8px 8px 0 0;}
			#log{height:420px;overflow-y:auto;padding:12px;background:#f4f6f8;border:1px solid #e0e4e8;}
			.msg{max-width:85%;margin:6px 0;padding:9px 12px;border-radius:12px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word;}
			.me{background:#1a73e8;color:#fff;margin-left:auto;text-align:right;}
			.ai{background:#fff;border:1px solid #e0e4e8;}
			.msg{display:block;width:fit-content;}
			.me{margin-left:auto;}
			.sys{color:#98a2ad;font-size:12px;text-align:center;margin:8px 0;}
			#bar{display:flex;gap:8px;padding:10px;background:#fff;border:1px solid #e0e4e8;border-top:0;border-radius:0 0 8px 8px;}
			#box{flex:1;border:1px solid #cfd6dd;border-radius:8px;padding:9px 11px;font-size:14px;resize:none;height:40px;box-sizing:border-box;}
			#send{background:#1a73e8;color:#fff;border:0;border-radius:8px;padding:0 18px;font-size:14px;cursor:pointer;}
			#mic{background:#eef3fb;color:#1a73e8;border:0;border-radius:8px;padding:0 13px;font-size:17px;cursor:pointer;display:none;}
			#mic.listening{background:#e53935;color:#fff;}
			button:disabled{opacity:.5;}
			#applaunch{display:block;background:#19488f;color:#fff;text-decoration:none;padding:13px 14px;font-size:15px;font-weight:bold;text-align:center;border-radius:8px;margin:0 0 10px;}
			#applaunch small{display:block;font-weight:normal;font-size:12px;opacity:.85;margin-top:3px;}
		</style>
	</head>
	<body style="font-family:sans-serif;margin:10px;">
		<div id="aihead">AI Assist <a id="popout" target="_blank" rel="noopener" style="float:right;color:#fff;font-weight:normal;font-size:12px;text-decoration:underline;">Open in tab (for voice)</a><button id="spk" type="button" title="Read replies aloud" style="float:right;background:none;border:0;color:#fff;font-size:15px;cursor:pointer;margin-right:12px;padding:0;">&#128263;</button></div>
		<a id="applaunch" style="display:none">Open in AI Assist app<small>Talk to Charlie about this job</small></a>
		<div id="log">
			<div class="msg ai">G'day. I'm your admin assistant for this job. I can book it in, move or cancel bookings, check the diary for free slots, add notes, set reminders, change status, or clone the job. What do you need?</div>
		</div>
		<div id="bar">
			<button id="mic" type="button" title="Tap to talk">&#127908;</button>
			<textarea id="box" placeholder="e.g. move this to Friday 9am"></textarea>
			<button id="send" type="button">Send</button>
		</div>
		<script>
			var client = SMClient.init();
			client.resizeWindow(720, 640);

			var TOKEN = ` + jsEmbed(token) + `;
			var JOB = ` + jsEmbed(jobUUID) + `;
			var JOBNUM = ` + jsEmbed(jobNumber) + `;
			// The app registers mrsparky-aiassist://. A real anchor the user taps
			// is the reliable way out of a webview — a scripted redirect gets
			// swallowed without a gesture. Hidden entirely if we could not
			// resolve a job number, so it can never be a button that does nothing.
			if (JOBNUM) {
				var launch = document.getElementById('applaunch');
				launch.href = 'mrsparky-aiassist://job/' + encodeURIComponent(JOBNUM);
				launch.style.display = 'block';
			}
			var URL_ = ` + jsEmbed(BACKEND_URL) + `;
			var chatlog = [];
			var busy = false;
			// Voice can't work inside SM8's embedded frame (no mic permission is
			// ever granted to it) — the pop-out opens the same chat top-level.
			document.getElementById('popout').href =
				'https://webchat.mrsparky.com.au/assist#t=' + encodeURIComponent(TOKEN) + '&j=' + encodeURIComponent(JOB);
			var log = document.getElementById('log');
			var box = document.getElementById('box');
			var send = document.getElementById('send');

			function add(cls, text) {
				var d = document.createElement('div');
				d.className = 'msg ' + cls;
				d.textContent = text;
				log.appendChild(d);
				log.scrollTop = log.scrollHeight;
				return d;
			}
			function sys(text) {
				var d = document.createElement('div');
				d.className = 'sys';
				d.textContent = text;
				log.appendChild(d);
				log.scrollTop = log.scrollHeight;
			}
			function setBusy(b) { busy = b; send.disabled = b; box.disabled = b; }

			function go() {
				var text = box.value.replace(/^\\s+|\\s+$/g, '');
				if (!text || busy) return;
				stopMic();
				box.value = '';
				add('me', text);
				chatlog.push({ role: 'user', text: text });
				var t = sysEl('thinking\\u2026');
				setBusy(true);
				// SM8's frame blocks direct calls to outside domains, so we route via
				// the SDK bridge: SM8 runs our function server-side, which relays to
				// the backend and returns its JSON as a string.
				client.invoke('ai_assist_chat', { jobUUID: JOB, messages: chatlog }).then(function (message) {
					log.removeChild(t); setBusy(false);
					var j = null;
					try { j = JSON.parse(message); } catch (e) {}
					if (j && j.error === 'tokenExpired') { sys('Session expired \\u2014 close this window and open AI Assist again.'); return; }
					if (!j || !j.ok) { sys((j && j.error) || 'Something went wrong \\u2014 try again.'); chatlog.pop(); return; }
					add('ai', j.reply);
					chatlog.push({ role: 'assistant', text: j.reply });
					say(j.reply);
					box.focus();
				}, function (err) {
					log.removeChild(t); setBusy(false);
					sys('Request failed \\u2014 try again.' + (err ? ' (' + err + ')' : ''));
					chatlog.pop();
				});
			}
			function sysNote(text) {
				var d = document.createElement('div');
				d.className = 'sys';
				d.textContent = text;
				log.appendChild(d);
				log.scrollTop = log.scrollHeight;
			}
			function sysEl(text) {
				var d = document.createElement('div');
				d.className = 'sys';
				d.textContent = text;
				log.appendChild(d);
				log.scrollTop = log.scrollHeight;
				return d;
			}

			send.onclick = go;
			box.addEventListener('keydown', function (e) {
				if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); }
			});

			// Read replies aloud (browser text-to-speech, en-AU). Toggle in header.
			var speakOn = false;
			var spk = document.getElementById('spk');
			spk.onclick = function () {
				speakOn = !speakOn;
				spk.innerHTML = speakOn ? '&#128266;' : '&#128263;';
				if (!speakOn) { try { speechSynthesis.cancel(); } catch (e) {} }
				else {
					// Speaking directly from the click both tests the speakers and
					// unlocks Chrome's speech engine for later replies.
					try { var u = new SpeechSynthesisUtterance('Voice on'); u.lang = 'en-AU'; speechSynthesis.speak(u); } catch (e) {}
				}
			};
			function say(text) {
				if (!speakOn || !window.speechSynthesis) return;
				try {
					speechSynthesis.cancel();
					// Chrome swallows speak() issued in the same tick as cancel().
					setTimeout(function () {
						var u = new SpeechSynthesisUtterance(text);
						u.lang = 'en-AU';
						speechSynthesis.speak(u);
					}, 90);
				} catch (e) {}
			}

			// Tap-to-talk (hidden when the webview lacks speech recognition).
			var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
			var rec = null; var listening = false;
			function stopMic() { if (rec && listening) { try { rec.stop(); } catch (e) {} } }
			if (SR) {
				var mic = document.getElementById('mic');
				mic.style.display = 'block';
				rec = new SR();
				rec.lang = 'en-AU'; rec.interimResults = true; rec.continuous = true;
				rec.onresult = function (e) {
					var t = '';
					for (var i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
					box.value = t;
				};
				rec.onend = function () { listening = false; mic.className = ''; box.focus(); };
				rec.onerror = function (e) {
					listening = false; mic.className = '';
					if (e && (e.error === 'not-allowed' || e.error === 'service-not-allowed')) {
						sysNote('Voice is blocked inside this ServiceM8 window — use "Open in tab (for voice)" at the top right.');
					}
				};
				mic.onclick = function () {
					if (listening) {
						rec.stop();
						// Tap-off = send what was dictated (small delay lets the final words land).
						setTimeout(function () { if (box.value.replace(/^\\s+|\\s+$/g, '')) go(); }, 300);
						return;
					}
					try { box.value = ''; rec.start(); listening = true; mic.className = 'listening'; } catch (e) {}
				};
			}
			box.focus();
		</script>
	</body>
</html>
`;

    return { eventResponse: html };
  } catch (e) {
    return errorPage(e && e.message || String(e));
  }
};
