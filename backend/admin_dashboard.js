"use strict";

var token="";
var currentTab="overview";
var overviewDays=30;
var userOffset=0;
var userTimer=null;
var auditTimer=null;
var ruleTypes=[];
var categories=[];

var pageMeta={
  overview:["Overview","Operational health, activation and recent backend activity."],
  users:["Users","Search, filter and manage optional backend accounts."],
  engagement:["Engagement","Usage trends, cohorts and activity feedback aggregates."],
  recommendations:["Recommendations","Manage the safe declarative recommendation rule catalog."],
  announcements:["Announcements","Publish controlled operational messages."],
  controls:["System & Controls","Feature flags, service health, retention and database diagnostics."],
  security:["Security","MFA posture, revocable sessions and admin access state."],
  audit:["Audit Log","Trace administrative and security-sensitive changes."]
};

function byId(id){return document.getElementById(id)}
function esc(v){return String(v===null||v===undefined?"":v).replace(/[&<>"']/g,function(m){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]})}
function fmt(n){return Number(n||0).toLocaleString()}
function pct(v){return v===null||v===undefined?"—":Math.round(v*100)+"%"}
function shortDate(v){if(!v)return "—";return String(v).slice(0,10)}
function stamp(v){if(!v)return "—";var d=new Date(Number(v)*1000);return isNaN(d.getTime())?"—":d.toLocaleString()}
function bytes(n){if(n<1024)return n+" B";if(n<1048576)return (n/1024).toFixed(1)+" KB";return (n/1048576).toFixed(1)+" MB"}

async function api(path,opts){
  opts=opts||{};
  var headers={Accept:"application/json"};
  if(opts.body)headers["Content-Type"]="application/json";
  if(token)headers.Authorization="Bearer "+token;
  var res=await fetch(path,Object.assign({},opts,{headers:headers}));
  var type=res.headers.get("content-type")||"";
  if(!res.ok){
    var err=type.indexOf("json")>=0?await res.json():{error:await res.text()};
    if(res.status===401&&token){endLocalSession();toast("Admin session expired or was revoked.");}
    throw new Error(err.error||("HTTP "+res.status));
  }
  return type.indexOf("json")>=0?await res.json():res;
}

function toast(message){
  var el=byId("toast");el.textContent=message;el.classList.remove("hidden");
  window.setTimeout(function(){el.classList.add("hidden")},2500);
}
function endLocalSession(){
  token="";
  byId("console").classList.add("hidden");
  byId("loginPage").classList.remove("hidden");
  byId("password").value="";
  byId("totp").value="";
  byId("password").focus();
}
async function login(){
  var status=byId("loginStatus");
  status.textContent="Signing in…";
  byId("loginButton").disabled=true;
  try{
    var data=await api("/admin/login",{method:"POST",body:JSON.stringify({
      password:byId("password").value,
      totp:byId("totp").value.trim()
    })});
    token=data.token;
    byId("loginPage").classList.add("hidden");
    byId("console").classList.remove("hidden");
    status.textContent="";
    showTab("overview",document.querySelector('.nav button[data-tab="overview"]'));
  }catch(e){status.textContent=e.message}
  finally{byId("loginButton").disabled=false}
}
async function logout(){
  try{if(token)await api("/admin/logout",{method:"POST"})}catch(_e){}
  endLocalSession();
}
function showTab(tab,btn){
  currentTab=tab;
  document.querySelectorAll("main section").forEach(function(x){x.classList.add("hidden")});
  var target=byId("tab-"+tab);if(target)target.classList.remove("hidden");
  document.querySelectorAll(".nav button").forEach(function(x){x.classList.remove("active");x.removeAttribute("aria-current")});
  if(btn){btn.classList.add("active");btn.setAttribute("aria-current","page")}
  byId("pageName").textContent=pageMeta[tab][0];
  byId("pageDesc").textContent=pageMeta[tab][1];
  byId("sidebar").classList.remove("open");
  byId("mainContent").focus({preventScroll:true});
  refreshCurrent();
}
function refreshCurrent(){
  if(currentTab==="overview")return loadOverview();
  if(currentTab==="users")return loadUsers();
  if(currentTab==="engagement")return loadEngagement();
  if(currentTab==="recommendations")return loadRecommendations();
  if(currentTab==="announcements")return loadAnnouncements();
  if(currentTab==="controls")return loadControls();
  if(currentTab==="security")return loadSecurity();
  if(currentTab==="audit")return loadAudit();
}
function kpi(label,value,sub){return '<div class="card kpi"><div class="kpiLabel">'+esc(label)+'</div><div class="kpiValue">'+esc(value)+'</div><div class="kpiSub">'+esc(sub||"")+'</div></div>'}
function lineChart(series,keys){
  if(!series.length)return '<div class="empty">No activity in this range.</div>';
  var w=760,h=205,pad=18,max=1;
  series.forEach(function(d){keys.forEach(function(k){max=Math.max(max,Number(d[k.key]||0))})});
  var x=function(i){return pad+(w-pad*2)*(i/Math.max(1,series.length-1))};
  var y=function(v){return h-pad-(h-pad*2)*(Number(v||0)/max)};
  var colors=["#2d776e","#d38d5b","#7890c5","#9c78b7"],grid="";
  for(var g=0;g<4;g++){var gy=pad+(h-pad*2)*g/3;grid+='<line x1="'+pad+'" y1="'+gy+'" x2="'+(w-pad)+'" y2="'+gy+'" stroke="#edf1f0" stroke-width="1"/>'}
  var lines=keys.map(function(k,idx){var pts=series.map(function(d,i){return x(i)+","+y(d[k.key])}).join(" ");return '<polyline fill="none" stroke="'+colors[idx%colors.length]+'" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="'+pts+'"/>'}).join("");
  var labels="",step=Math.max(1,Math.ceil(series.length/6));
  for(var i=0;i<series.length;i+=step){labels+='<text class="chartLabel" x="'+x(i)+'" y="'+(h+7)+'" text-anchor="middle">'+esc(series[i].day.slice(5))+'</text>'}
  return '<svg viewBox="0 0 '+w+' '+(h+14)+'" role="img" aria-label="Operational trend chart">'+grid+lines+labels+'</svg>';
}
function bars(items,labelKey,valueKey){
  if(!items.length)return '<div class="empty">No usage data yet.</div>';
  var max=Math.max.apply(null,items.map(function(x){return Number(x[valueKey]||0)}).concat([1]));
  return items.slice(0,8).map(function(x){var v=Number(x[valueKey]||0);return '<div class="barRow"><div><b>'+esc(x[labelKey])+'</b></div><div class="barTrack"><div class="barFill" style="width:'+Math.round(v/max*100)+'%"></div></div><div class="muted">'+fmt(v)+'</div></div>'}).join("");
}

async function loadOverview(){
  try{
    var data=await Promise.all([
      api("/admin/api/summary"),
      api("/admin/api/analytics?days="+overviewDays),
      api("/admin/api/activity-usage?days=30"),
      api("/admin/api/funnel"),
      api("/admin/api/cohorts?weeks=8")
    ]);
    var s=data[0],a=data[1],u=data[2],f=data[3],co=data[4];
    byId("kpis").innerHTML=[
      kpi("Total users",fmt(s.users),fmt(s.new_users_30d)+" new in 30d"),
      kpi("Active users · 7d",fmt(s.active_users_7d),fmt(s.active_users_30d)+" active in 30d"),
      kpi("Mood logs · 30d",fmt(s.mood_logs_30d),fmt(s.mood_logs)+" all-time backend logs"),
      kpi("Activities · 30d",fmt(s.activity_logs_30d),pct(s.helpful_rate)+" marked helpful overall")
    ].join("");
    byId("trendChart").innerHTML=lineChart(a.series,[{key:"mood_logs"},{key:"activities"},{key:"active_users"}]);
    byId("usageBars").innerHTML=bars(u.activities,"activity_id","attempts");
    byId("pulse").innerHTML='<div><b>'+fmt(s.new_users_30d)+'</b><span>new accounts · 30d</span></div><div><b>'+pct(s.helpful_rate)+'</b><span>helpful ratings</span></div><div><b>'+fmt(s.disabled_users)+'</b><span>disabled accounts</span></div>';
    byId("funnel").innerHTML=f.stages.map(function(x,i){return '<div class="funnelStage"><div><span>'+esc(x.label)+'</span><b>'+fmt(x.users)+'</b></div><div class="barTrack"><div class="barFill" style="width:'+Math.round((x.rate||0)*100)+'%"></div></div><small>'+pct(x.rate)+(i?" of registered":"")+'</small></div>'}).join("");
    byId("cohorts").innerHTML=co.cohorts.length?co.cohorts.slice(-8).map(function(x){return '<div class="barRow"><div><b>'+esc(x.cohort_start)+'</b><div class="muted">'+fmt(x.users)+' registered</div></div><div class="barTrack"><div class="barFill" style="width:'+Math.round((x.activation_rate||0)*100)+'%"></div></div><div>'+pct(x.activation_rate)+'</div></div>'}).join(""):'<div class="empty">Cohorts appear after backend accounts register.</div>';
  }catch(e){toast(e.message)}
}
function setOverviewRange(days,btn){
  overviewDays=days;
  document.querySelectorAll("#overviewRange button").forEach(function(x){x.classList.remove("active")});
  btn.classList.add("active");loadOverview();
}

function statusBadge(s){return '<span class="badge '+esc(s)+'">'+esc(s)+'</span>'}
function debounceUsers(){clearTimeout(userTimer);userTimer=setTimeout(function(){userOffset=0;loadUsers()},250)}
async function loadUsers(){
  try{
    var q=encodeURIComponent(byId("userSearch").value||""),status=byId("userStatus").value,sort=byId("userSort").value;
    var d=await api("/admin/api/users?limit=25&offset="+userOffset+"&q="+q+"&status="+status+"&sort="+sort);
    byId("usersBody").innerHTML=d.users.length?d.users.map(function(u){
      return '<tr><td><button class="tiny mono" data-action="open-user" data-id="'+esc(u.id)+'">'+esc(u.id.slice(0,12))+'…</button></td><td>'+statusBadge(u.status)+'</td><td>'+shortDate(u.created_at)+'</td><td>'+shortDate(u.last_seen)+'</td><td>'+fmt(u.mood_logs)+'</td><td>'+fmt(u.activity_logs)+'</td><td>'+fmt(u.activity_minutes)+'</td><td><div class="actions"><button class="tiny" data-action="toggle-user" data-id="'+esc(u.id)+'" data-disabled="'+(u.disabled?"0":"1")+'">'+(u.disabled?"Enable":"Disable")+'</button><button class="tiny danger" data-action="delete-user" data-id="'+esc(u.id)+'">Delete</button></div></td></tr>';
    }).join(""):'<tr><td colspan="8" class="empty">No users match these filters.</td></tr>';
    var prev=userOffset>0,next=userOffset+25<d.total;
    byId("userPager").innerHTML='<span class="muted">'+fmt(d.total)+' total · showing '+(d.total?userOffset+1:0)+'–'+Math.min(userOffset+25,d.total)+'</span><div class="actions"><button class="tiny" data-action="page-users" data-delta="-25" '+(prev?"":"disabled")+'>Previous</button><button class="tiny" data-action="page-users" data-delta="25" '+(next?"":"disabled")+'>Next</button></div>';
  }catch(e){toast(e.message)}
}
function pageUsers(delta){userOffset=Math.max(0,userOffset+delta);loadUsers()}
async function openUser(id){
  try{
    var u=await api("/admin/api/users/"+encodeURIComponent(id)+"/summary");
    byId("drawer").innerHTML='<div class="drawerHead"><div><div class="muted">BACKEND USER METADATA</div><h2 class="mono">'+esc(id.slice(0,16))+'…</h2></div><button class="tiny" data-action="close-drawer">Close</button></div><p class="muted bodyCopy">'+esc(u.privacy)+'</p><div class="drawerGrid"><div class="drawerStat"><b>'+fmt(u.mood_7d)+'</b><span>Mood logs · 7d</span></div><div class="drawerStat"><b>'+fmt(u.mood_30d)+'</b><span>Mood logs · 30d</span></div><div class="drawerStat"><b>'+fmt(u.activity_30d)+'</b><span>Activities · 30d</span></div><div class="drawerStat"><b>'+pct(u.helpful_rate)+'</b><span>Helpful ratings</span></div><div class="drawerStat"><b>'+fmt(u.activity_minutes)+'</b><span>Total activity minutes</span></div><div class="drawerStat"><b>'+(u.disabled?"Disabled":"Active")+'</b><span>Account state</span></div></div><div class="drawerMeta"><p>Created: '+esc(u.created_at)+'</p><p>Last mood log: '+shortDate(u.last_mood_day)+'</p><p>Last activity: '+shortDate(u.last_activity_day)+'</p></div><div class="actions drawerActions"><button class="btn secondary" data-action="toggle-user" data-id="'+esc(id)+'" data-disabled="'+(u.disabled?"0":"1")+'">'+(u.disabled?"Enable account":"Disable account")+'</button><button class="btn danger" data-action="delete-user" data-id="'+esc(id)+'">Delete backend account</button></div>';
    byId("drawerBackdrop").classList.remove("hidden");byId("drawer").classList.remove("hidden");byId("drawer").focus();
  }catch(e){toast(e.message)}
}
function closeDrawer(){byId("drawerBackdrop").classList.add("hidden");byId("drawer").classList.add("hidden")}
async function setDisabled(id,disabled){
  if(!confirm((disabled?"Disable":"Enable")+" this backend account?"))return;
  try{await api("/admin/api/users/"+encodeURIComponent(id)+"/disabled",{method:"POST",body:JSON.stringify({disabled:disabled})});toast("Account updated");closeDrawer();loadUsers();if(currentTab==="overview")loadOverview()}catch(e){toast(e.message)}
}
async function removeUser(id){
  if(!confirm("Permanently delete this backend account and all of its server records? This cannot be undone."))return;
  try{await api("/admin/api/users/"+encodeURIComponent(id),{method:"DELETE"});toast("Backend account deleted");closeDrawer();loadUsers()}catch(e){toast(e.message)}
}
async function exportUsers(){
  try{var res=await api("/admin/api/export/users.csv");var blob=await res.blob();var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="mood-insight-users-metadata.csv";a.click();URL.revokeObjectURL(a.href);toast("Metadata export prepared")}catch(e){toast(e.message)}
}

async function loadEngagement(){
  try{
    var days=byId("engagementDays").value;
    var data=await Promise.all([api("/admin/api/analytics?days="+days),api("/admin/api/activity-usage?days="+days)]);
    byId("engagementChart").innerHTML=lineChart(data[0].series,[{key:"mood_logs"},{key:"activities"},{key:"active_users"},{key:"registrations"}]);
    var usage=data[1].activities,max=Math.max.apply(null,usage.map(function(i){return i.attempts}).concat([1]));
    byId("engagementUsage").innerHTML=usage.length?usage.slice(0,10).map(function(x){return '<div class="barRow"><div><b>'+esc(x.activity_id)+'</b><div class="muted">'+fmt(x.users)+' users · '+fmt(x.minutes)+' min · '+pct(x.helpful_rate)+' helpful</div></div><div class="barTrack"><div class="barFill" style="width:'+Math.min(100,x.attempts/max*100)+'%"></div></div><div>'+fmt(x.attempts)+'</div></div>'}).join(""):'<div class="empty">No activity feedback yet.</div>';
  }catch(e){toast(e.message)}
}

function ruleOptions(value){return ruleTypes.map(function(x){return '<option value="'+esc(x)+'" '+(x===value?"selected":"")+'>'+esc(x.replaceAll("_"," "))+'</option>'}).join("")}
function categoryOptions(value){return categories.map(function(x){return '<option value="'+esc(x)+'" '+(x===value?"selected":"")+'>'+esc(x)+'</option>'}).join("")}
async function loadRecommendations(){
  try{
    var d=await api("/admin/api/activities");ruleTypes=d.rule_types||[];categories=d.categories||[];
    byId("recommendationRows").innerHTML=d.activities.length?d.activities.map(function(a){
      return '<article class="ruleCard"><div class="ruleHeader"><div><b>'+esc(a.title)+'</b><span class="mono">'+esc(a.id)+'</span></div><span class="badge '+(a.enabled?"active":"disabled")+'">'+(a.enabled?"enabled":"disabled")+'</span></div><div class="ruleGrid"><label>Title<input class="field" id="title-'+a.id+'" value="'+esc(a.title)+'"></label><label>Minutes<input class="field" id="minutes-'+a.id+'" type="number" min="1" max="120" value="'+a.minutes+'"></label><label>Difficulty<select class="select" id="difficulty-'+a.id+'"><option '+(a.difficulty==="Easy"?"selected":"")+'>Easy</option><option '+(a.difficulty==="Moderate"?"selected":"")+'>Moderate</option></select></label><label>Category<select class="select" id="category-'+a.id+'">'+categoryOptions(a.category)+'</select></label><label>Rule<select class="select" id="rule-'+a.id+'">'+ruleOptions(a.rule_type)+'</select></label><label>Threshold<input class="field" id="threshold-'+a.id+'" type="number" step="0.5" value="'+a.threshold+'"></label><label>Priority<input class="field" id="priority-'+a.id+'" type="number" min="-10" max="10" value="'+a.priority+'"></label><label class="checkboxLabel"><input id="enabled-'+a.id+'" type="checkbox" '+(a.enabled?"checked":"")+'> Enabled</label><label class="wide">User-facing reason<textarea class="textarea" id="reason-'+a.id+'" maxlength="300">'+esc(a.reason)+'</textarea></label></div><div class="actions"><button class="btn" data-action="save-activity" data-id="'+a.id+'">Save rule</button><button class="btn secondary" data-action="delete-activity" data-id="'+a.id+'">Delete</button></div><p class="muted">Updated '+esc(a.updated_at)+'</p></article>';
    }).join(""):'<div class="empty">No recommendation rules configured.</div>';
    if(!byId("newRecommendationForm").classList.contains("hidden"))renderNewRecommendationForm();
  }catch(e){toast(e.message)}
}
function activityPayload(id){
  return {
    title:byId("title-"+id).value,
    minutes:Number(byId("minutes-"+id).value),
    difficulty:byId("difficulty-"+id).value,
    category:byId("category-"+id).value,
    rule_type:byId("rule-"+id).value,
    threshold:Number(byId("threshold-"+id).value),
    priority:Number(byId("priority-"+id).value),
    enabled:byId("enabled-"+id).checked,
    reason:byId("reason-"+id).value
  };
}
async function saveActivity(id){
  try{await api("/admin/api/activities/"+encodeURIComponent(id),{method:"PUT",body:JSON.stringify(activityPayload(id))});toast("Recommendation rule saved");loadRecommendations()}catch(e){toast(e.message)}
}
async function deleteActivity(id){
  if(!confirm("Delete this unused recommendation rule? Rules with activity history must be disabled instead."))return;
  try{await api("/admin/api/activities/"+encodeURIComponent(id),{method:"DELETE"});toast("Recommendation rule deleted");loadRecommendations()}catch(e){toast(e.message)}
}
function renderNewRecommendationForm(){
  byId("newRecommendationForm").innerHTML='<h3>New declarative rule</h3><div class="ruleGrid"><label>ID<input id="new-id" class="field" placeholder="e.g. energypause"></label><label>Title<input id="new-title" class="field" placeholder="Activity title"></label><label>Minutes<input id="new-minutes" class="field" type="number" min="1" max="120" value="5"></label><label>Difficulty<select id="new-difficulty" class="select"><option>Easy</option><option>Moderate</option></select></label><label>Category<select id="new-category" class="select">'+categoryOptions("balance")+'</select></label><label>Rule<select id="new-rule" class="select">'+ruleOptions("always")+'</select></label><label>Threshold<input id="new-threshold" class="field" type="number" step="0.5" value="0"></label><label>Priority<input id="new-priority" class="field" type="number" min="-10" max="10" value="0"></label><label class="checkboxLabel"><input id="new-enabled" type="checkbox" checked> Enabled</label><label class="wide">User-facing reason<textarea id="new-reason" class="textarea" maxlength="300" placeholder="Explain why this option may fit without making a clinical claim."></textarea></label></div><div class="actions"><button class="btn" data-action="create-activity">Create rule</button><button class="btn secondary" data-action="cancel-new-activity">Cancel</button></div>';
}
function toggleNewRecommendation(){
  var el=byId("newRecommendationForm");
  el.classList.toggle("hidden");
  if(!el.classList.contains("hidden"))renderNewRecommendationForm();
}
async function createActivity(){
  var payload={id:byId("new-id").value.trim(),title:byId("new-title").value,minutes:Number(byId("new-minutes").value),difficulty:byId("new-difficulty").value,category:byId("new-category").value,rule_type:byId("new-rule").value,threshold:Number(byId("new-threshold").value),priority:Number(byId("new-priority").value),enabled:byId("new-enabled").checked,reason:byId("new-reason").value};
  try{await api("/admin/api/activities",{method:"POST",body:JSON.stringify(payload)});toast("Recommendation rule created");byId("newRecommendationForm").classList.add("hidden");loadRecommendations()}catch(e){toast(e.message)}
}

async function loadAnnouncements(){
  try{
    var d=await api("/admin/api/announcements");
    byId("announcementsList").innerHTML=d.announcements.length?d.announcements.map(function(a){
      var expired=a.expires_at&&a.expires_at<new Date().toISOString().slice(0,10);
      return '<div class="switchRow"><div class="switchMeta"><div class="inlineMeta"><b>'+esc(a.title)+'</b><span class="badge '+esc(a.level)+'">'+esc(a.level)+'</span>'+(expired?'<span class="badge dormant">expired</span>':'')+'</div><p>'+esc(a.body)+'</p><p>Created '+shortDate(a.created_at)+(a.expires_at?' · expires '+esc(a.expires_at):' · no expiry')+'</p></div><div class="actions"><button class="tiny" data-action="toggle-announcement" data-id="'+a.id+'" data-active="'+(a.active?"0":"1")+'">'+(a.active?"Pause":"Activate")+'</button><button class="tiny danger" data-action="delete-announcement" data-id="'+a.id+'">Delete</button></div></div>';
    }).join(""):'<div class="empty">No announcements yet.</div>';
  }catch(e){toast(e.message)}
}
async function createAnnouncement(){
  try{
    var payload={title:byId("annTitle").value,body:byId("annBody").value,level:byId("annLevel").value,expires_at:byId("annExpiry").value||null};
    await api("/admin/api/announcements",{method:"POST",body:JSON.stringify(payload)});
    byId("annTitle").value="";byId("annBody").value="";byId("annExpiry").value="";
    toast("Announcement published");loadAnnouncements();
  }catch(e){toast(e.message)}
}
async function toggleAnnouncement(id,active){try{await api("/admin/api/announcements/"+encodeURIComponent(id)+"/active",{method:"POST",body:JSON.stringify({active:active})});toast("Announcement updated");loadAnnouncements()}catch(e){toast(e.message)}}
async function deleteAnnouncement(id){if(!confirm("Delete this announcement from backend history?"))return;try{await api("/admin/api/announcements/"+encodeURIComponent(id),{method:"DELETE"});toast("Announcement deleted");loadAnnouncements()}catch(e){toast(e.message)}}

async function loadControls(){
  try{
    var data=await Promise.all([api("/admin/api/flags"),api("/admin/api/system"),api("/admin/api/retention")]);
    var flags=data[0].flags,sys=data[1],ret=data[2];
    byId("flags").innerHTML=flags.map(function(f){return '<div class="switchRow"><div class="switchMeta"><b>'+esc(f.category)+' · '+esc(f.key)+'</b><p>'+esc(f.description)+' · updated '+shortDate(f.updated_at)+'</p></div><button class="toggle '+(f.value?"on":"")+'" aria-pressed="'+(f.value?"true":"false")+'" data-action="set-flag" data-key="'+esc(f.key)+'" data-value="'+(f.value?"0":"1")+'" aria-label="Toggle '+esc(f.key)+'"></button></div>'}).join("");
    var diag=[["Integrity",sys.database_integrity],["DB size",bytes(sys.database_bytes)],["Retention",sys.retention_days+" days"],["Admin TTL",Math.round(sys.admin_token_ttl_seconds/60)+" min"],["Max request",bytes(sys.max_request_bytes)],["SQLite",sys.sqlite_version]];
    byId("systemGrid").innerHTML=diag.map(function(x){return '<div class="sys"><b>'+esc(x[1])+'</b><span>'+esc(x[0])+'</span></div>'}).join("");
    var counts=Object.keys(sys.table_counts).map(function(k){return {name:k,value:sys.table_counts[k]}});byId("tableCounts").innerHTML=bars(counts,"name","value");
    byId("retention").innerHTML='<div class="statMini"><div><b>'+fmt(ret.expired_mood_logs)+'</b><span>expired mood logs</span></div><div><b>'+fmt(ret.expired_activity_logs)+'</b><span>expired activity logs</span></div><div><b>'+esc(ret.cutoff)+'</b><span>current cutoff</span></div></div><p class="muted">Normal data writes already enforce retention. This control is an audited manual enforcement pass.</p>';
  }catch(e){toast(e.message)}
}
async function setFlag(key,value){try{await api("/admin/api/flags/"+encodeURIComponent(key),{method:"PUT",body:JSON.stringify({value:value})});toast("Feature flag updated");loadControls()}catch(e){toast(e.message)}}
async function purgeRetention(){if(!confirm("Run the backend retention purge now? Only records older than the configured 365-day boundary are removed."))return;try{var r=await api("/admin/api/retention/purge",{method:"POST"});toast("Purged "+fmt(r.mood_logs+r.activity_logs)+" expired records");loadControls()}catch(e){toast(e.message)}}

async function loadSecurity(){
  try{
    var data=await Promise.all([api("/admin/api/session"),api("/admin/api/sessions"),api("/admin/api/system")]);
    var current=data[0],sessions=data[1].sessions,sys=data[2],s=current.session||{};
    byId("securitySummary").innerHTML=[
      ["Session",s.id?esc(s.id.slice(0,12))+"…":"—"],
      ["Created",stamp(s.created_at)],["Last seen",stamp(s.last_seen_at)],["Expires",stamp(s.expires_at)]
    ].map(function(x){return '<div class="sys"><b>'+x[1]+'</b><span>'+x[0]+'</span></div>'}).join("");
    byId("securityPosture").innerHTML='<div class="securityChecklist"><div><span class="statusDot okDot"></span><b>Server-side revocation</b><small>Every admin token is bound to a revocable session record.</small></div><div><span class="statusDot '+(current.mfa_configured?"okDot":"warnDot")+'"></span><b>MFA '+(current.mfa_configured?"configured":"not configured")+'</b><small>'+(current.mfa_configured?"TOTP is required at login.":"Set MOOD_ADMIN_TOTP_SECRET to require a 6-digit TOTP code.")+'</small></div><div><span class="statusDot okDot"></span><b>Strict script policy</b><small>Admin scripts are external and the server applies a same-origin Content Security Policy.</small></div><div><span class="statusDot '+(sys.database_integrity==="ok"?"okDot":"warnDot")+'"></span><b>Database integrity '+esc(sys.database_integrity)+'</b><small>SQLite quick_check result from this runtime.</small></div></div>';
    byId("sessionsBody").innerHTML=sessions.length?sessions.map(function(x){return '<tr><td class="mono">'+esc(x.id.slice(0,12))+'…'+(x.current?' <span class="badge active">current</span>':'')+'</td><td>'+stamp(x.created_at)+'</td><td>'+stamp(x.last_seen_at)+'</td><td>'+stamp(x.expires_at)+'</td><td>'+(x.active?'<span class="badge active">active</span>':'<span class="badge dormant">closed</span>')+'</td><td>'+(x.active&&!x.current?'<button class="tiny danger" data-action="revoke-session" data-id="'+esc(x.id)+'">Revoke</button>':'—')+'</td></tr>'}).join(""):'<tr><td colspan="6" class="empty">No admin sessions.</td></tr>';
  }catch(e){toast(e.message)}
}
async function revokeSession(id){if(!confirm("Revoke this administrator session?"))return;try{await api("/admin/api/sessions/"+encodeURIComponent(id)+"/revoke",{method:"POST"});toast("Admin session revoked");loadSecurity()}catch(e){toast(e.message)}}

function debounceAudit(){clearTimeout(auditTimer);auditTimer=setTimeout(loadAudit,250)}
async function loadAudit(){
  try{
    var q=encodeURIComponent(byId("auditSearch").value||""),action=encodeURIComponent(byId("auditAction").value||"");
    var d=await api("/admin/api/audit?limit=150&q="+q+"&action="+action);
    byId("auditBody").innerHTML=d.events.length?d.events.map(function(e){return '<tr><td>'+esc(e.created_at)+'</td><td><span class="badge">'+esc(e.action)+'</span></td><td class="mono">'+esc(e.target||"—")+'</td><td>'+esc(e.detail||"")+'</td></tr>'}).join(""):'<tr><td colspan="4" class="empty">No audit events match.</td></tr>';
    var sel=byId("auditAction"),current=sel.value;
    sel.innerHTML='<option value="">All actions</option>'+d.actions.map(function(a){return '<option value="'+esc(a)+'" '+(a===current?"selected":"")+'>'+esc(a)+'</option>'}).join("");
  }catch(e){toast(e.message)}
}

document.addEventListener("click",function(e){
  var el=e.target.closest("button,[data-action]");if(!el)return;
  if(el.matches(".nav button[data-tab]")){showTab(el.dataset.tab,el);return}
  if(el.matches("#overviewRange button[data-range]")){setOverviewRange(Number(el.dataset.range),el);return}
  var action=el.dataset.action,id=el.dataset.id;
  if(action==="open-user")openUser(id);
  else if(action==="toggle-user")setDisabled(id,el.dataset.disabled==="1");
  else if(action==="delete-user")removeUser(id);
  else if(action==="page-users")pageUsers(Number(el.dataset.delta));
  else if(action==="close-drawer")closeDrawer();
  else if(action==="save-activity")saveActivity(id);
  else if(action==="delete-activity")deleteActivity(id);
  else if(action==="create-activity")createActivity();
  else if(action==="cancel-new-activity")byId("newRecommendationForm").classList.add("hidden");
  else if(action==="toggle-announcement")toggleAnnouncement(id,el.dataset.active==="1");
  else if(action==="delete-announcement")deleteAnnouncement(id);
  else if(action==="set-flag")setFlag(el.dataset.key,el.dataset.value==="1");
  else if(action==="revoke-session")revokeSession(id);
});
byId("loginForm").addEventListener("submit",function(e){e.preventDefault();login()});
byId("logoutButton").addEventListener("click",logout);
byId("refreshButton").addEventListener("click",refreshCurrent);
byId("mobileMenuButton").addEventListener("click",function(){byId("sidebar").classList.toggle("open")});
byId("exportUsersButton").addEventListener("click",exportUsers);
byId("userSearch").addEventListener("input",debounceUsers);
byId("userStatus").addEventListener("change",function(){userOffset=0;loadUsers()});
byId("userSort").addEventListener("change",function(){userOffset=0;loadUsers()});
byId("engagementDays").addEventListener("change",loadEngagement);
byId("newRecommendationButton").addEventListener("click",toggleNewRecommendation);
byId("publishAnnouncementButton").addEventListener("click",createAnnouncement);
byId("purgeRetentionButton").addEventListener("click",purgeRetention);
byId("auditSearch").addEventListener("input",debounceAudit);
byId("auditAction").addEventListener("change",loadAudit);
byId("drawerBackdrop").addEventListener("click",closeDrawer);
document.addEventListener("keydown",function(e){if(e.key==="Escape")closeDrawer()});
