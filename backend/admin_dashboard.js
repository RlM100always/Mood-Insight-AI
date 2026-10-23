var token="";
var currentTab="overview";
var overviewDays=30;
var userOffset=0;
var userTimer=null;
var auditTimer=null;
var pageMeta={
  overview:["Overview","Operational health and recent backend activity."],
  users:["Users","Search, filter and manage optional backend accounts."],
  engagement:["Engagement","Usage trends and activity feedback aggregates."],
  recommendations:["Recommendations","Manage the backend recommendation catalog."],
  announcements:["Announcements","Publish controlled operational messages."],
  controls:["System & Controls","Feature flags, service health and database diagnostics."],
  audit:["Audit Log","Trace administrative and security-sensitive changes."]
};
function esc(v){return String(v===null||v===undefined?"":v).replace(/[&<>"']/g,function(m){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]})}
function fmt(n){return Number(n||0).toLocaleString()}
function pct(v){return v===null||v===undefined?"—":Math.round(v*100)+"%"}
function shortDate(v){if(!v)return "—";return String(v).slice(0,10)}
function bytes(n){if(n<1024)return n+" B";if(n<1048576)return (n/1024).toFixed(1)+" KB";return (n/1048576).toFixed(1)+" MB"}
async function api(path,opts){
  opts=opts||{};var headers={Accept:"application/json"};
  if(opts.body)headers["Content-Type"]="application/json";
  if(token)headers.Authorization="Bearer "+token;
  var res=await fetch(path,Object.assign({},opts,{headers:headers}));
  var type=res.headers.get("content-type")||"";
  if(!res.ok){var err=type.indexOf("json")>=0?await res.json():{error:await res.text()};throw new Error(err.error||("HTTP "+res.status))}
  return type.indexOf("json")>=0?await res.json():res;
}
function toast(message){var el=document.getElementById("toast");el.textContent=message;el.classList.remove("hidden");setTimeout(function(){el.classList.add("hidden")},2200)}
async function login(){
  var status=document.getElementById("loginStatus");status.textContent="Signing in…";
  try{var data=await api("/admin/login",{method:"POST",body:JSON.stringify({password:document.getElementById("password").value})});token=data.token;document.getElementById("loginPage").classList.add("hidden");document.getElementById("console").classList.remove("hidden");status.textContent="";await loadOverview()}
  catch(e){status.textContent=e.message}
}
function logout(){token="";document.getElementById("console").classList.add("hidden");document.getElementById("loginPage").classList.remove("hidden");document.getElementById("password").value=""}
function showTab(tab,btn){
  currentTab=tab;document.querySelectorAll("main section").forEach(function(x){x.classList.add("hidden")});document.getElementById("tab-"+tab).classList.remove("hidden");
  document.querySelectorAll(".nav button").forEach(function(x){x.classList.remove("active")});if(btn)btn.classList.add("active");
  document.getElementById("pageName").textContent=pageMeta[tab][0];document.getElementById("pageDesc").textContent=pageMeta[tab][1];
  document.getElementById("sidebar").classList.remove("open");refreshCurrent();
}
function refreshCurrent(){if(currentTab==="overview")return loadOverview();if(currentTab==="users")return loadUsers();if(currentTab==="engagement")return loadEngagement();if(currentTab==="recommendations")return loadRecommendations();if(currentTab==="announcements")return loadAnnouncements();if(currentTab==="controls")return loadControls();if(currentTab==="audit")return loadAudit()}
function kpi(label,value,sub){return '<div class="card kpi"><div class="kpiLabel">'+esc(label)+'</div><div class="kpiValue">'+esc(value)+'</div><div class="kpiSub">'+esc(sub||"")+'</div></div>'}
function lineChart(series,keys){
  if(!series.length)return '<div class="empty">No activity in this range.</div>';
  var w=760,h=205,pad=18;var max=1;
  series.forEach(function(d){keys.forEach(function(k){max=Math.max(max,Number(d[k.key]||0))})});
  var x=function(i){return pad+(w-pad*2)*(i/Math.max(1,series.length-1))};
  var y=function(v){return h-pad-(h-pad*2)*(Number(v||0)/max)};
  var colors=["#2d776e","#d38d5b","#7890c5","#9c78b7"];
  var grid="";for(var g=0;g<4;g++){var gy=pad+(h-pad*2)*g/3;grid+='<line x1="'+pad+'" y1="'+gy+'" x2="'+(w-pad)+'" y2="'+gy+'" stroke="#edf1f0" stroke-width="1"/>'}
  var lines=keys.map(function(k,idx){var pts=series.map(function(d,i){return x(i)+","+y(d[k.key])}).join(" ");return '<polyline fill="none" stroke="'+colors[idx%colors.length]+'" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="'+pts+'"/>'}).join("");
  var labels="";var step=Math.max(1,Math.ceil(series.length/6));for(var i=0;i<series.length;i+=step){labels+='<text class="chartLabel" x="'+x(i)+'" y="'+(h+7)+'" text-anchor="middle">'+esc(series[i].day.slice(5))+'</text>'}
  return '<svg viewBox="0 0 '+w+' '+(h+14)+'" role="img" aria-label="Activity trend">'+grid+lines+labels+'</svg>';
}
function bars(items,labelKey,valueKey){
  if(!items.length)return '<div class="empty">No usage data yet.</div>';var max=Math.max.apply(null,items.map(function(x){return Number(x[valueKey]||0)}).concat([1]));
  return items.slice(0,8).map(function(x){var v=Number(x[valueKey]||0);return '<div class="barRow"><div><b>'+esc(x[labelKey])+'</b></div><div class="barTrack"><div class="barFill" style="width:'+Math.round(v/max*100)+'%"></div></div><div class="muted">'+fmt(v)+'</div></div>'}).join("");
}
async function loadOverview(){
  try{
    var data=await Promise.all([api("/admin/api/summary"),api("/admin/api/analytics?days="+overviewDays),api("/admin/api/activity-usage?days=30")]);
    var s=data[0],a=data[1],u=data[2];
    document.getElementById("kpis").innerHTML=[
      kpi("Total users",fmt(s.users),fmt(s.new_users_30d)+" new in 30d"),
      kpi("Active users · 7d",fmt(s.active_users_7d),fmt(s.active_users_30d)+" active in 30d"),
      kpi("Mood logs · 30d",fmt(s.mood_logs_30d),fmt(s.mood_logs)+" all-time backend logs"),
      kpi("Activities · 30d",fmt(s.activity_logs_30d),pct(s.helpful_rate)+" marked helpful overall")
    ].join("");
    document.getElementById("trendChart").innerHTML=lineChart(a.series,[{key:"mood_logs"},{key:"activities"},{key:"active_users"}]);
    document.getElementById("usageBars").innerHTML=bars(u.activities,"activity_id","attempts");
    document.getElementById("pulse").innerHTML='<div><b>'+fmt(s.new_users_30d)+'</b><span>new accounts · 30d</span></div><div><b>'+pct(s.helpful_rate)+'</b><span>helpful ratings</span></div><div><b>'+fmt(s.disabled_users)+'</b><span>disabled accounts</span></div>';
  }catch(e){toast(e.message)}
}
function setOverviewRange(days,btn){overviewDays=days;document.querySelectorAll("#overviewRange button").forEach(function(x){x.classList.remove("active")});btn.classList.add("active");loadOverview()}
function statusBadge(s){return '<span class="badge '+esc(s)+'">'+esc(s)+'</span>'}
function debounceUsers(){clearTimeout(userTimer);userTimer=setTimeout(function(){userOffset=0;loadUsers()},250)}
async function loadUsers(){
  try{
    var q=encodeURIComponent(document.getElementById("userSearch").value||"");var status=document.getElementById("userStatus").value;var sort=document.getElementById("userSort").value;
    var d=await api("/admin/api/users?limit=25&offset="+userOffset+"&q="+q+"&status="+status+"&sort="+sort);
    document.getElementById("usersBody").innerHTML=d.users.length?d.users.map(function(u){return '<tr><td><button class="tiny mono" onclick="openUser(\''+esc(u.id)+'\')">'+esc(u.id.slice(0,12))+'…</button></td><td>'+statusBadge(u.status)+'</td><td>'+shortDate(u.created_at)+'</td><td>'+shortDate(u.last_seen)+'</td><td>'+fmt(u.mood_logs)+'</td><td>'+fmt(u.activity_logs)+'</td><td>'+fmt(u.activity_minutes)+'</td><td><div class="actions"><button class="tiny" onclick="setDisabled(\''+esc(u.id)+'\','+(!u.disabled)+')">'+(u.disabled?"Enable":"Disable")+'</button><button class="tiny danger" onclick="removeUser(\''+esc(u.id)+'\')">Delete</button></div></td></tr>'}).join(""):'<tr><td colspan="8" class="empty">No users match these filters.</td></tr>';
    var prev=userOffset>0;var next=userOffset+25<d.total;document.getElementById("userPager").innerHTML='<span class="muted">'+fmt(d.total)+' total · showing '+(d.total?userOffset+1:0)+'–'+Math.min(userOffset+25,d.total)+'</span><div class="actions"><button class="tiny" '+(prev?"":"disabled")+' onclick="pageUsers(-25)">Previous</button><button class="tiny" '+(next?"":"disabled")+' onclick="pageUsers(25)">Next</button></div>';
  }catch(e){toast(e.message)}
}
function pageUsers(delta){userOffset=Math.max(0,userOffset+delta);loadUsers()}
async function openUser(id){
  try{var u=await api("/admin/api/users/"+encodeURIComponent(id)+"/summary");var helpful=pct(u.helpful_rate);document.getElementById("drawer").innerHTML='<div class="drawerHead"><div><div class="muted">BACKEND USER METADATA</div><h2 class="mono">'+esc(id.slice(0,16))+'…</h2></div><button class="tiny" onclick="closeDrawer()">Close</button></div><p class="muted" style="font-size:11px;line-height:1.6">'+esc(u.privacy)+'</p><div class="drawerGrid"><div class="drawerStat"><b>'+fmt(u.mood_7d)+'</b><span>Mood logs · 7d</span></div><div class="drawerStat"><b>'+fmt(u.mood_30d)+'</b><span>Mood logs · 30d</span></div><div class="drawerStat"><b>'+fmt(u.activity_30d)+'</b><span>Activities · 30d</span></div><div class="drawerStat"><b>'+helpful+'</b><span>Helpful ratings</span></div><div class="drawerStat"><b>'+fmt(u.activity_minutes)+'</b><span>Total activity minutes</span></div><div class="drawerStat"><b>'+(u.disabled?"Disabled":"Active")+'</b><span>Account state</span></div></div><div style="margin-top:18px"><p class="muted">Created: '+esc(u.created_at)+'</p><p class="muted">Last mood log: '+shortDate(u.last_mood_day)+'</p><p class="muted">Last activity: '+shortDate(u.last_activity_day)+'</p></div><div class="actions" style="margin-top:18px"><button class="btn secondary" onclick="setDisabled(\''+esc(id)+'\','+(!u.disabled)+');closeDrawer()">'+(u.disabled?"Enable account":"Disable account")+'</button><button class="btn danger" onclick="removeUser(\''+esc(id)+'\');closeDrawer()">Delete backend account</button></div>';document.getElementById("drawerBackdrop").classList.remove("hidden");document.getElementById("drawer").classList.remove("hidden")}catch(e){toast(e.message)}
}
function closeDrawer(){document.getElementById("drawerBackdrop").classList.add("hidden");document.getElementById("drawer").classList.add("hidden")}
async function setDisabled(id,disabled){if(!confirm((disabled?"Disable":"Enable")+" this backend account?"))return;try{await api("/admin/api/users/"+encodeURIComponent(id)+"/disabled",{method:"POST",body:JSON.stringify({disabled:disabled})});toast("Account updated");loadUsers();if(currentTab==="overview")loadOverview()}catch(e){toast(e.message)}}
async function removeUser(id){if(!confirm("Permanently delete this backend account and all of its server records? This cannot be undone."))return;try{await api("/admin/api/users/"+encodeURIComponent(id),{method:"DELETE"});toast("Backend account deleted");loadUsers()}catch(e){toast(e.message)}}
async function exportUsers(){try{var res=await api("/admin/api/export/users.csv");var blob=await res.blob();var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="mood-insight-users-metadata.csv";a.click();URL.revokeObjectURL(a.href);toast("Metadata export prepared")}catch(e){toast(e.message)}}
async function loadEngagement(){
  try{var days=document.getElementById("engagementDays").value;var data=await Promise.all([api("/admin/api/analytics?days="+days),api("/admin/api/activity-usage?days="+days)]);document.getElementById("engagementChart").innerHTML=lineChart(data[0].series,[{key:"mood_logs"},{key:"activities"},{key:"active_users"},{key:"registrations"}]);var usage=data[1].activities;document.getElementById("engagementUsage").innerHTML=usage.length?usage.slice(0,10).map(function(x){return '<div class="barRow"><div><b>'+esc(x.activity_id)+'</b><div class="muted">'+fmt(x.users)+' users · '+fmt(x.minutes)+' min · '+pct(x.helpful_rate)+' helpful</div></div><div class="barTrack"><div class="barFill" style="width:'+Math.min(100,x.attempts/Math.max.apply(null,usage.map(function(i){return i.attempts}).concat([1]))*100)+'%"></div></div><div>'+fmt(x.attempts)+'</div></div>'}).join(""):'<div class="empty">No activity feedback yet.</div>'}catch(e){toast(e.message)}
}
async function loadRecommendations(){
  try{var d=await api("/admin/api/activities");document.getElementById("recommendationRows").innerHTML=d.activities.map(function(a){return '<div class="reco"><input class="field" id="title-'+a.id+'" value="'+esc(a.title)+'"><input class="field" id="minutes-'+a.id+'" type="number" min="1" max="120" value="'+a.minutes+'"><select class="select" id="difficulty-'+a.id+'"><option '+(a.difficulty==="Easy"?"selected":"")+'>Easy</option><option '+(a.difficulty==="Moderate"?"selected":"")+'>Moderate</option></select><input class="field" id="priority-'+a.id+'" type="number" min="-10" max="10" value="'+a.priority+'"><button class="toggle '+(a.enabled?"on":"")+'" id="enabled-'+a.id+'" data-on="'+(a.enabled?"1":"0")+'" onclick="flipActivity(\''+a.id+'\')"></button><button class="tiny" onclick="saveActivity(\''+a.id+'\')">Save</button></div>'}).join("")}catch(e){toast(e.message)}
}
function flipActivity(id){var b=document.getElementById("enabled-"+id);var on=b.dataset.on==="1";b.dataset.on=on?"0":"1";b.classList.toggle("on",!on)}
async function saveActivity(id){try{var payload={title:document.getElementById("title-"+id).value,minutes:Number(document.getElementById("minutes-"+id).value),difficulty:document.getElementById("difficulty-"+id).value,priority:Number(document.getElementById("priority-"+id).value),enabled:document.getElementById("enabled-"+id).dataset.on==="1"};await api("/admin/api/activities/"+encodeURIComponent(id),{method:"PUT",body:JSON.stringify(payload)});toast("Recommendation saved");loadRecommendations()}catch(e){toast(e.message)}}
async function loadAnnouncements(){try{var d=await api("/admin/api/announcements");document.getElementById("announcementsList").innerHTML=d.announcements.length?d.announcements.map(function(a){var expired=a.expires_at&&a.expires_at<new Date().toISOString().slice(0,10);return '<div class="switchRow"><div class="switchMeta"><div style="display:flex;gap:7px;align-items:center"><b>'+esc(a.title)+'</b><span class="badge '+esc(a.level)+'">'+esc(a.level)+'</span>'+(expired?'<span class="badge dormant">expired</span>':'')+'</div><p>'+esc(a.body)+'</p><p>Created '+shortDate(a.created_at)+(a.expires_at?' · expires '+esc(a.expires_at):' · no expiry')+'</p></div><div class="actions"><button class="tiny" onclick="toggleAnnouncement(\''+a.id+'\','+(!a.active)+')">'+(a.active?"Pause":"Activate")+'</button><button class="tiny danger" onclick="deleteAnnouncement(\''+a.id+'\')">Delete</button></div></div>'}).join(""):'<div class="empty">No announcements yet.</div>'}catch(e){toast(e.message)}}
async function createAnnouncement(){try{var payload={title:document.getElementById("annTitle").value,body:document.getElementById("annBody").value,level:document.getElementById("annLevel").value,expires_at:document.getElementById("annExpiry").value||null};await api("/admin/api/announcements",{method:"POST",body:JSON.stringify(payload)});document.getElementById("annTitle").value="";document.getElementById("annBody").value="";document.getElementById("annExpiry").value="";toast("Announcement published");loadAnnouncements()}catch(e){toast(e.message)}}
async function toggleAnnouncement(id,active){try{await api("/admin/api/announcements/"+encodeURIComponent(id)+"/active",{method:"POST",body:JSON.stringify({active:active})});toast("Announcement updated");loadAnnouncements()}catch(e){toast(e.message)}}
async function deleteAnnouncement(id){if(!confirm("Delete this announcement from the backend history?"))return;try{await api("/admin/api/announcements/"+encodeURIComponent(id),{method:"DELETE"});toast("Announcement deleted");loadAnnouncements()}catch(e){toast(e.message)}}
async function loadControls(){try{var data=await Promise.all([api("/admin/api/flags"),api("/admin/api/system")]);var flags=data[0].flags,sys=data[1];document.getElementById("flags").innerHTML=flags.map(function(f){return '<div class="switchRow"><div class="switchMeta"><b>'+esc(f.category)+' · '+esc(f.key)+'</b><p>'+esc(f.description)+' · updated '+shortDate(f.updated_at)+'</p></div><button class="toggle '+(f.value?"on":"")+'" onclick="setFlag(\''+f.key+'\','+(!f.value)+')"></button></div>'}).join("");var diag=[["Integrity",sys.database_integrity],["DB size",bytes(sys.database_bytes)],["Retention",sys.retention_days+" days"],["Admin TTL",Math.round(sys.admin_token_ttl_seconds/60)+" min"],["Max request",bytes(sys.max_request_bytes)],["SQLite",sys.sqlite_version]];document.getElementById("systemGrid").innerHTML=diag.map(function(x){return '<div class="sys"><b>'+esc(x[1])+'</b><span>'+esc(x[0])+'</span></div>'}).join("");var counts=Object.keys(sys.table_counts).map(function(k){return {name:k,value:sys.table_counts[k]}});document.getElementById("tableCounts").innerHTML=bars(counts,"name","value")}catch(e){toast(e.message)}}
async function setFlag(key,value){try{await api("/admin/api/flags/"+encodeURIComponent(key),{method:"PUT",body:JSON.stringify({value:value})});toast("Feature flag updated");loadControls()}catch(e){toast(e.message)}}
function debounceAudit(){clearTimeout(auditTimer);auditTimer=setTimeout(loadAudit,250)}
async function loadAudit(){try{var q=encodeURIComponent(document.getElementById("auditSearch").value||"");var action=encodeURIComponent(document.getElementById("auditAction").value||"");var d=await api("/admin/api/audit?limit=150&q="+q+"&action="+action);document.getElementById("auditBody").innerHTML=d.events.length?d.events.map(function(e){return '<tr><td>'+esc(e.created_at)+'</td><td><span class="badge">'+esc(e.action)+'</span></td><td class="mono">'+esc(e.target||"—")+'</td><td>'+esc(e.detail||"")+'</td></tr>'}).join(""):'<tr><td colspan="4" class="empty">No audit events match.</td></tr>';var sel=document.getElementById("auditAction");var current=sel.value;sel.innerHTML='<option value="">All actions</option>'+d.actions.map(function(a){return '<option value="'+esc(a)+'" '+(a===current?"selected":"")+'>'+esc(a)+'</option>'}).join("")}catch(e){toast(e.message)}}
document.addEventListener("keydown",function(e){if(e.key==="Enter"&&!document.getElementById("loginPage").classList.contains("hidden"))login();if(e.key==="Escape")closeDrawer()});