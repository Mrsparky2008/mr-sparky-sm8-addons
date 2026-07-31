// ServiceM8 Simple Function Add-on: "AI Assist"
// Smart admin/scheduling chat assistant on the job card.
// This function just renders the chat page with the session token embedded;
// the brains live at https://webchat.mrsparky.com.au/assist (Henri's Lambda,
// handlers/assist.mjs in the mr-sparky-sms-bot repo).
//
// Paste this file into the ServiceM8 developer portal (Store Item → Simple
// Function). Backup lives at github.com/Mrsparky2008/mr-sparky-sm8-addons.

var BACKEND_URL = 'https://webchat.mrsparky.com.au/assist';

function jsEmbed(value) {
  // JSON-encode for safe embedding inside a <script> block.
  return JSON.stringify(String(value || '')).replace(/</g, '\\u003c');
}

function errorPage(msg) {
  return '<!doctype html><html><head><meta charset="utf-8"><title>AI Assist</title></head>' +
    '<body style="font-family:system-ui;margin:24px"><h3>AI Assist could not start</h3><p>' +
    String(msg || 'Unknown error').replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }) +
    '</p><p>Close this window and try again from the job card.</p></body></html>';
}

// Async handler — ServiceM8's Simple Function runtime is Node.js 24+, which no
// longer supports the old callback(event, context, callback) signature.
exports.handler = async function (event) {
  try {
    var token = event && event.auth && event.auth.accessToken;
    var jobUUID = event && event.eventArgs && event.eventArgs.jobUUID;
    if (!token || !jobUUID) {
      return errorPage('Missing session token or job — open a Job Card and click AI Assist again.');
    }

    var html = '<!doctype html><html><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>AI Assist</title>' +
      '<script src="https://platform.servicem8.com/sdk/1.0/sdk.js"><\/script>' +
      '<style>' +
      '*{box-sizing:border-box}' +
      'body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#f4f6f8;display:flex;flex-direction:column;height:100vh}' +
      'header{background:#1a73e8;color:#fff;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;flex:0 0 auto}' +
      'header b{font-size:15px}' +
      'header button{background:rgba(255,255,255,.2);border:0;color:#fff;border-radius:6px;padding:5px 10px;cursor:pointer}' +
      '#log{flex:1 1 auto;overflow-y:auto;padding:14px}' +
      '.msg{max-width:85%;margin:6px 0;padding:9px 12px;border-radius:12px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word}' +
      '.me{background:#1a73e8;color:#fff;margin-left:auto;border-bottom-right-radius:4px}' +
      '.ai{background:#fff;border:1px solid #e0e4e8;border-bottom-left-radius:4px}' +
      '.sys{color:#98a2ad;font-size:12px;text-align:center;margin:8px 0}' +
      '.typing{color:#98a2ad;font-size:13px;padding:4px 12px}' +
      'footer{flex:0 0 auto;display:flex;gap:8px;padding:10px;background:#fff;border-top:1px solid #e0e4e8}' +
      'textarea{flex:1;border:1px solid #cfd6dd;border-radius:8px;padding:9px 11px;font:inherit;font-size:14px;resize:none;height:42px;outline:none}' +
      'textarea:focus{border-color:#1a73e8}' +
      'footer button{background:#1a73e8;color:#fff;border:0;border-radius:8px;padding:0 18px;font-size:14px;cursor:pointer}' +
      'footer button:disabled{opacity:.5;cursor:default}' +
      '#mic{background:#eef3fb;color:#1a73e8;padding:0 13px;font-size:17px}' +
      '#mic.listening{background:#e53935;color:#fff;animation:micpulse 1.2s infinite}' +
      '@keyframes micpulse{0%,100%{opacity:1}50%{opacity:.55}}' +
      '</style></head><body>' +
      '<header><b>AI Assist</b><button id="closeBtn" type="button">Close</button></header>' +
      '<div id="log">' +
      '<div class="msg ai">G\'day. I\'m your admin assistant for this job. I can book it in, move or cancel bookings, check the diary for free slots, add notes, set reminders, change status, or clone the job for a re-inspection. What do you need?</div>' +
      '</div>' +
      '<footer><button id="mic" type="button" style="display:none" title="Tap to talk">&#127908;</button>' +
      '<textarea id="box" placeholder="e.g. move this to Friday 9am, or cancel Thursday\'s booking" rows="1"></textarea>' +
      '<button id="send" type="button">Send</button></footer>' +
      '<script>' +
      'var TOKEN=' + jsEmbed(token) + ';' +
      'var JOB=' + jsEmbed(jobUUID) + ';' +
      'var URL_=' + jsEmbed(BACKEND_URL) + ';' +
      'var history=[];var busy=false;var smc=null;' +
      'try{smc=SMClient.init();}catch(e){}' +
      'var log=document.getElementById("log"),box=document.getElementById("box"),send=document.getElementById("send");' +
      'document.getElementById("closeBtn").onclick=function(){if(smc&&smc.closeWindow){smc.closeWindow();}else{window.close();}};' +
      'function add(cls,text){var d=document.createElement("div");d.className="msg "+cls;d.textContent=text;log.appendChild(d);log.scrollTop=log.scrollHeight;return d;}' +
      'function sys(text){var d=document.createElement("div");d.className="sys";d.textContent=text;log.appendChild(d);log.scrollTop=log.scrollHeight;}' +
      'function setBusy(b){busy=b;send.disabled=b;box.disabled=b;}' +
      'function go(){' +
        'var text=box.value.replace(/^\\s+|\\s+$/g,"");if(!text||busy)return;' +
        'box.value="";add("me",text);history.push({role:"user",text:text});' +
        'var t=document.createElement("div");t.className="typing";t.textContent="thinking\\u2026";log.appendChild(t);log.scrollTop=log.scrollHeight;' +
        'setBusy(true);' +
        'fetch(URL_,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:TOKEN,jobUUID:JOB,messages:history})})' +
        '.then(function(r){return r.json().then(function(j){return{status:r.status,j:j};});})' +
        '.then(function(res){' +
          'log.removeChild(t);setBusy(false);' +
          'if(res.status===401){sys("Session expired \\u2014 close this window and open AI Assist again from the job card.");return;}' +
          'if(!res.j||!res.j.ok){sys((res.j&&res.j.error)||"Something went wrong \\u2014 try again.");history.pop();return;}' +
          'add("ai",res.j.reply);history.push({role:"assistant",text:res.j.reply});' +
          'box.focus();' +
        '})' +
        '.catch(function(){log.removeChild(t);setBusy(false);sys("Network error \\u2014 try again.");history.pop();});' +
      '}' +
      'send.onclick=go;' +
      'box.addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();go();}});' +
      // Tap-to-talk: browser speech recognition (en-AU). Button stays hidden when
      // the webview doesn't support it — phone-keyboard dictation still works.
      'var SR=window.SpeechRecognition||window.webkitSpeechRecognition;' +
      'if(SR){var mic=document.getElementById("mic");mic.style.display="";' +
        'var rec=new SR();rec.lang="en-AU";rec.interimResults=true;rec.continuous=false;var listening=false;' +
        'rec.onresult=function(e){var t="";for(var i=0;i<e.results.length;i++){t+=e.results[i][0].transcript;}box.value=t;};' +
        'rec.onend=function(){listening=false;mic.className="";box.focus();};' +
        'rec.onerror=function(){listening=false;mic.className="";};' +
        'mic.onclick=function(){' +
          'if(listening){rec.stop();return;}' +
          'try{box.value="";rec.start();listening=true;mic.className="listening";}catch(e){}' +
        '};' +
      '}' +
      'box.focus();' +
      '<\/script></body></html>';

    return html;
  } catch (e) {
    return errorPage(e && e.message || String(e));
  }
};
