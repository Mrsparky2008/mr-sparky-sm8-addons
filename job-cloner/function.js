// ServiceM8 Simple Function Add-on: "Job Cloner" (re-inspection duplicator)
// Hosted on ServiceM8's infrastructure (developer portal), NOT in AWS.
// Install URL: https://go.servicem8.com/addon_install?uuid=60e2541e-af6f-4d90-a96e-23270474412b
// Backup saved 2026-07-31 from code Steven pasted (source of truth = SM8 developer portal editor).
//
// What it does: job-card action. Reads the source job + its JOB/BILLING contacts,
// creates a new Quote-status job at the same address ("Re-inspection (auto): ..."
// description with original appended), same company/category/PO/reference,
// re-creates both contacts on the new job, then closes its window via the SM8 SDK.
// On failure, shows an error page telling the tech to call the office.
//
// NOTE: the AWS Lambda sm8-advnaced-clone (ap-southeast-2) is a leftover DEBUG stub
// from development — it is not part of this add-on's runtime.

var https = require('https');

/* ================== HTTP helper ================== */
function sm8(method, path, token, body) {
  var opts = {
    hostname: 'api.servicem8.com',
    path: path,
    method: method,
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  };
  return new Promise(function(resolve, reject) {
    var req = https.request(opts, function(res) {
      var data = '';
      res.on('data', function(d) { data += d; });
      res.on('end', function() {
        var parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch(e) {}
        resolve({ status: res.statusCode, headers: res.headers || {}, body: parsed, raw: data });
      });
    });
    req.on('error', reject);
    if (body) { try { req.write(JSON.stringify(body)); } catch(e) {} }
    req.end();
  });
}

function toArray(maybe) {
  if (!maybe) return [];
  if (Object.prototype.toString.call(maybe) === '[object Array]') return maybe;
  if (maybe.records && Object.prototype.toString.call(maybe.records) === '[object Array]') return maybe.records;
  return [];
}
function firstOfType(list, type) {
  var up = (type || '').toUpperCase();
  for (var i = 0; i < list.length; i++) {
    var c = list[i] || {};
    if ((c.type || '').toUpperCase() === up) return c;
  }
  return null;
}
function hasDetails(c) {
  return !!(c && (c.first || c.last || c.email || c.mobile || c.phone));
}

/* ================== Minimal HTML ================== */
function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]);});
}
function closeImmediatelyPage() {
  return [
    '<!doctype html><html><head><meta charset="utf-8"><title>Done</title>',
    '<script src="https://platform.servicem8.com/sdk/1.0/sdk.js"></script>',
    '<script>',
      'var client;',
      'window.addEventListener("load",function(){',
        'try{client=SMClient.init();}catch(e){}',
        'setTimeout(function(){ if(client && client.closeWindow){client.closeWindow();} else {window.close();} }, 150);',
      '});',
    '</script>',
    '</head><body></body></html>'
  ].join('');
}
function errorPage(msg){
  return [
    '<!doctype html><html><head><meta charset="utf-8"><title>Duplication Failed</title>',
    '<style>body{font-family:system-ui;margin:16px} pre{background:#f6f6f6;padding:12px;border-radius:8px;white-space:pre-wrap}</style>',
    '</head><body>',
    '<h2>Duplication failed 😞</h2>',
    '<p>Please call the office for manual duplication and report this error to IT.</p>',
    '<h4>Error details:</h4><pre>',
    escapeHtml(msg||'Unknown error'),
    '</pre></body></html>'
  ].join('');
}

/* ================== Handler ================== */
exports.handler = function(event, context, callback) {
  try {
    var token   = event && event.auth && event.auth.accessToken;
    var jobUUID = event && event.eventArgs && event.eventArgs.jobUUID;
    if (!token || !jobUUID) return callback(null, errorPage('Missing token or jobUUID. Open a Job Card and click again.'));

    var srcJob = null;
    var listAll = [];
    var listThisJob = [];
    var jobContactListItem = null;
    var billingContactListItem = null;
    var jobContactFull = null;
    var billingContactFull = null;
    var newJobUUID = null;

    sm8('GET', '/api_1.0/job/' + encodeURIComponent(jobUUID) + '.json', token)
      .then(function(jres) {
        if (jres.status !== 200 || !jres.body) throw new Error('Read Job failed: ' + jres.status + ' ' + (jres.raw || ''));
        srcJob = jres.body;
        return sm8('GET', '/api_1.0/jobcontact.json', token);
      })
      .then(function(cres) {
        listAll = toArray(cres.body);
        for (var i = 0; i < listAll.length; i++) {
          var c = listAll[i] || {};
          if (c.job_uuid === jobUUID) listThisJob.push(c);
        }
        jobContactListItem     = firstOfType(listThisJob, 'JOB');
        billingContactListItem = firstOfType(listThisJob, 'BILLING');
        var chain = Promise.resolve();

        if (jobContactListItem && jobContactListItem.uuid) {
          chain = chain.then(function() {
            return sm8('GET', '/api_1.0/jobcontact/' + encodeURIComponent(jobContactListItem.uuid) + '.json', token)
              .then(function(r) { jobContactFull = r.body || null; });
          });
        }
        if (billingContactListItem && billingContactListItem.uuid) {
          chain = chain.then(function() {
            return sm8('GET', '/api_1.0/jobcontact/' + encodeURIComponent(billingContactListItem.uuid) + '.json', token)
              .then(function(r) { billingContactFull = r.body || null; });
          });
        }
        return chain;
      })
      .then(function() {
        var createPayload = {
          status: 'Quote',
          job_address: srcJob.job_address || '',
          job_description:
            'Re-inspection (auto): ' + (srcJob.job_address || '') +
            '\n\nOriginal:\n' + (srcJob.job_description || ''),
          company_uuid: srcJob.company_uuid || undefined,
          client_uuid:  srcJob.client_uuid  || undefined,
          billing_client_uuid: srcJob.billing_client_uuid || undefined,
          category_uuid: srcJob.category_uuid || undefined,
          purchase_order_number: srcJob.purchase_order_number || undefined,
          reference: srcJob.reference || undefined
        };
        for (var k in createPayload) {
          if (createPayload.hasOwnProperty(k) && (createPayload[k] == null || createPayload[k] === '')) {
            delete createPayload[k];
          }
        }
        return sm8('POST', '/api_1.0/job.json', token, createPayload);
      })
      .then(function(cr) {
        if (cr.status < 200 || cr.status >= 300) throw new Error('Create Job failed: ' + cr.status + ' ' + (cr.raw || ''));
        newJobUUID = cr.headers['x-record-uuid'] || cr.headers['X-Record-UUID'] ||
                     (cr.body && (cr.body.uuid || cr.body.job_uuid)) || '';
        if (!newJobUUID) throw new Error('Create Job succeeded but no new job UUID found.');

        var chain = Promise.resolve();
        if (hasDetails(jobContactFull)) {
          var newJobContact = {
            job_uuid: newJobUUID,
            first:  jobContactFull.first  || '',
            last:   jobContactFull.last   || '',
            email:  jobContactFull.email  || '',
            phone:  jobContactFull.phone  || '',
            mobile: jobContactFull.mobile || '',
            type:   'JOB',
            is_primary_contact: '1',
            active: 1
          };
          chain = chain.then(function() {
            return sm8('POST', '/api_1.0/jobcontact.json', token, newJobContact);
          });
        }
        if (hasDetails(billingContactFull)) {
          var newBillingContact = {
            job_uuid: newJobUUID,
            first:  billingContactFull.first  || '',
            last:   billingContactFull.last   || '',
            email:  billingContactFull.email  || '',
            phone:  billingContactFull.phone  || '',
            mobile: billingContactFull.mobile || '',
            type:   'BILLING',
            is_primary_contact: '0',
            active: 1
          };
          chain = chain.then(function() {
            return sm8('POST', '/api_1.0/jobcontact.json', token, newBillingContact);
          });
        }
        return chain;
      })
      .then(function() {
        return callback(null, closeImmediatelyPage());
      })
      .catch(function(err) {
        var msg = (err && err.message) ? err.message : String(err);
        return callback(null, errorPage(msg));
      });

  } catch (e) {
    return callback(null, errorPage(e && e.message || String(e)));
  }
};
