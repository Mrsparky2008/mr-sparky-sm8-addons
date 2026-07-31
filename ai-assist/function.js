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

exports.handler = async (event) => {
  try {
    var token = event && event.auth && event.auth.accessToken;
    var jobUUID = event && event.eventArgs && event.eventArgs.jobUUID;
    console.log('AI Assist v3 invoked | event:', event && event.eventName, '| token:', !!token, '| job:', jobUUID || '(none)');
    if (!token || !jobUUID) {
      return errorPage('Missing session token or job — open a Job Card and click AI Assist again.');
    }

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
		</style>
	</head>
	<body style="font-family:sans-serif;margin:10px;">
		<div id="aihead">AI Assist</div>
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
			var URL_ = ` + jsEmbed(BACKEND_URL) + `;
			var history = [];
			var busy = false;
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
				box.value = '';
				add('me', text);
				history.push({ role: 'user', text: text });
				var t = sysEl('thinking\\u2026');
				setBusy(true);
				fetch(URL_, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ token: TOKEN, jobUUID: JOB, messages: history })
				}).then(function (r) {
					return r.json().then(function (j) { return { status: r.status, j: j }; });
				}).then(function (res) {
					log.removeChild(t); setBusy(false);
					if (res.status === 401) { sys('Session expired \\u2014 close this window and open AI Assist again.'); return; }
					if (!res.j || !res.j.ok) { sys((res.j && res.j.error) || 'Something went wrong \\u2014 try again.'); history.pop(); return; }
					add('ai', res.j.reply);
					history.push({ role: 'assistant', text: res.j.reply });
					box.focus();
				}).catch(function () {
					log.removeChild(t); setBusy(false);
					sys('Network error \\u2014 try again.');
					history.pop();
				});
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

			// Tap-to-talk (hidden when the webview lacks speech recognition).
			var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
			if (SR) {
				var mic = document.getElementById('mic');
				mic.style.display = 'block';
				var rec = new SR();
				rec.lang = 'en-AU'; rec.interimResults = true; rec.continuous = false;
				var listening = false;
				rec.onresult = function (e) {
					var t = '';
					for (var i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
					box.value = t;
				};
				rec.onend = function () { listening = false; mic.className = ''; box.focus(); };
				rec.onerror = function () { listening = false; mic.className = ''; };
				mic.onclick = function () {
					if (listening) { rec.stop(); return; }
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
