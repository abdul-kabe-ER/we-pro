/* PaaniLink frontend. All data comes from fetch('/api/...'). No data is hardcoded in the UI. */
const S={token:sessionStorage.getItem('tok'),user:null,rules:null,route:'bookings'};
const $=s=>document.querySelector(s);
const h=(t,a={},...k)=>{const e=document.createElement(t);for(const[x,v]of Object.entries(a)){if(x==='class')e.className=v;else if(x.startsWith('on'))e[x]=v;else if(v!==false&&v!=null)e.setAttribute(x,v);}
 k.flat().forEach(c=>e.append(c instanceof Node?c:document.createTextNode(c??'')));return e;};
async function api(method,path,body){const r=await fetch(path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+(S.token||'')},body:body?JSON.stringify(body):undefined});
 const d=await r.json();if(!r.ok){const e=new Error(d.message||'Error');e.errors=d.errors;e.status=r.status;throw e;}return d;}
function toast(m,bad){const t=$('#toast');t.textContent=m;t.className='show'+(bad?' bad':'');clearTimeout(toast.t);toast.t=setTimeout(()=>t.className='',2800);}
const money=n=>'Rs '+Number(n).toLocaleString();
const today=()=>new Date().toISOString().slice(0,10);

/* ---- Validation (client side). VARIATION: put the group-specific rule here (see README) ---- */
const V={cnic:v=>/^\d{13}$/.test(v)||'CNIC must be 13 digits (no dashes)',phone:v=>/^03\d{9}$/.test(v)||'Phone must look like 03001234567',
 min:n=>v=>v.trim().length>=n||`At least ${n} characters`,plate:v=>/^[A-Z]{3}-\d{3,4}$/.test(v)||'Plate like KHI-1234'};
const VARIATION=(vals,formName)=>({}); // TODO: return {field:'message'} for the group's extra validation rule

/* ---- Generic dialog form ---- */
function openForm({title,fields,ok='Submit',submit}){return new Promise(res=>{
 const d=$('#dlg'),body=$('#dbody');$('#dtitle').textContent=title;$('#dok').textContent=ok;$('#derr').textContent='';body.innerHTML='';
 fields.forEach(f=>{const id='f_'+f.name;let inp;
  if(f.type==='select')inp=h('select',{id,name:f.name},f.options.map(([v,l])=>h('option',{value:v},l)));
  else if(f.type==='textarea')inp=h('textarea',{id,name:f.name,rows:3});else inp=h('input',{id,name:f.name,type:f.type||'text',min:f.min,max:f.max,autocomplete:f.auto||'off'});
  if(f.value!=null)inp.value=f.value;if(f.onchange)inp.onchange=()=>f.onchange(inp);body.append(h('label',{for:id},f.label,inp));});
 const close=v=>{d.close();res(v);};$('#dcancel').onclick=()=>close(null);
 $('#dform').onsubmit=async e=>{e.preventDefault();const vals={},errs={};
  fields.forEach(f=>{const el=$('#f_'+f.name);vals[f.name]=el.value;el.classList.remove('invalid');
   if(f.required!==false&&!String(el.value).trim())errs[f.name]=f.label+' is required';
   else if(f.check){const r=f.check(el.value);if(r!==true)errs[f.name]=r;}});
  Object.assign(errs,VARIATION(vals,title));
  const show=m=>{Object.keys(m).forEach(k=>$('#f_'+k)&&$('#f_'+k).classList.add('invalid'));$('#derr').textContent=Object.values(m).join(' · ');};
  if(Object.keys(errs).length)return show(errs);
  try{await submit(vals);close(vals);}catch(x){if(x.errors)show(x.errors);else $('#derr').textContent=x.message;}};
 d.showModal();});}

/* ---- Auth ---- */
async function boot(){S.rules=await api('GET','/api/rules');
 if(S.token){try{const m=await api('GET','/api/me');S.user=m.user;S.monthUsed=m.monthUsed;}catch(e){S.token=null;}}
 S.user?shell():loginView();}
function loginView(){$('#nav').innerHTML='';$('#who').textContent='';$('#logout').hidden=true;
 const f=h('form',{class:'card login',novalidate:true,onsubmit:async e=>{e.preventDefault();const u=$('#lu').value.trim(),p=$('#lp').value;
  if(!u||!p)return $('#le').textContent='Enter username and password';
  try{const r=await api('POST','/api/auth/login',{username:u,password:p});S.token=r.token;sessionStorage.setItem('tok',r.token);boot();}catch(x){$('#le').textContent=x.message;}}},
  h('h1',{},'PaaniLink Login'),h('label',{for:'lu'},'Username',h('input',{id:'lu',autocomplete:'username'})),h('label',{for:'lp'},'Password',h('input',{id:'lp',type:'password',autocomplete:'current-password'})),
  h('p',{class:'err',id:'le'}),h('div',{class:'actions'},h('button',{type:'submit'},'Login'),h('button',{type:'button',class:'ghost',onclick:registerForm},'Register as customer')),
  h('p',{class:'hint'},'Demo users (password 1234): customer, mosque, officer, operator, driver, driver2, admin'));
 $('#main').replaceChildren(f);}
async function registerForm(){const zones=await api('GET','/api/zones');
 await openForm({title:'Customer registration',ok:'Register',fields:[{name:'name',label:'Full name',check:V.min(3)},{name:'cnic',label:'CNIC',check:V.cnic},{name:'phone',label:'Phone',check:V.phone},
  {name:'address',label:'Address',check:V.min(10)},{name:'zoneId',label:'Zone',type:'select',options:zones.map(z=>[z.id,z.name])},{name:'username',label:'Username',check:V.min(4)},{name:'password',label:'Password',type:'password',check:V.min(4)}],
  submit:async v=>{await api('POST','/api/auth/register',{...v,zoneId:+v.zoneId});toast('Registered. You can log in now.');}});}
$('#logout').onclick=()=>{sessionStorage.removeItem('tok');S.token=null;S.user=null;loginView();};

/* ---- Shell / routing by role ---- */
function shell(){const nav=S.rules.nav[S.user.role];$('#who').textContent=`${S.user.name} (${S.user.role})`;$('#logout').hidden=false;
 S.route=nav[0][0];drawNav();go(S.route);}
function drawNav(){$('#nav').replaceChildren(...S.rules.nav[S.user.role].map(([r,l])=>h('a',{href:'#'+r,class:r===S.route?'on':'',onclick:e=>{e.preventDefault();go(r);}},l)));}
async function go(r){S.route=r;drawNav();$('#main').replaceChildren(h('p',{},'Loading…'));
 try{await ({bookings:bookingsView,new:newBooking,subsidy:subsidyView,resources:resourcesView,reports:reportsView,bills:billsView,zones:zonesView,rates:ratesView,users:usersView}[r])();}catch(e){$('#main').replaceChildren(h('p',{class:'err'},e.message));}}

/* ---- Bookings list with role/status based actions ---- */
async function bookingsView(){const role=S.user.role;let status='',q='';
 const list=h('div',{class:'grid'+(role==='driver'?' driver':'')});
 const draw=async()=>{const p=new URLSearchParams();if(status)p.set('status',status);if(q)p.set('q',q);
  const rows=await api('GET','/api/bookings?'+p);list.replaceChildren(...(rows.length?rows.map(card):[h('p',{},'No bookings found.')]));};
 const st=h('select',{'aria-label':'Filter by status',onchange:e=>{status=e.target.value;draw();}},h('option',{value:''},'All statuses'),...Object.keys(S.rules.actions).length?[...new Set(Object.values(S.rules.actions).map(a=>a.to).concat('PENDING_APPROVAL'))].map(s=>h('option',{value:s},s)):[]);
 const se=h('input',{type:'search','aria-label':'Search bookings',placeholder:'Search name, address, id',oninput:e=>{q=e.target.value;clearTimeout(se.t);se.t=setTimeout(draw,250);}});
 $('#main').replaceChildren(h('h1',{},role==='driver'?'My Trips':'Bookings'),...(role==='driver'?[]:[h('div',{class:'bar'},se,st)]),list);
 function card(b){const acts=Object.entries(S.rules.actions).filter(([k,a])=>a.roles.includes(role)&&a.from.includes(b.status));
  return h('article',{class:'card'},h('h3',{},`#${b.id} · ${b.size.toLocaleString()} gal `,h('span',{class:'badge '+b.status},b.status.replace('_',' '))),
   h('p',{},`${b.type} · ${money(b.amount)}`),h('p',{},`📅 ${b.date} ${b.time}`),h('p',{},`📍 ${b.address}`),role!=='customer'?h('p',{},'👤 '+b.customerName):null,
   b.tankerPlate?h('p',{},'🚚 '+b.tankerPlate+(b.driverName&&role!=='customer'?' · driver '+b.driverName:'')):null,b.reason?h('p',{},'Reason: '+b.reason):null,
   h('div',{class:'timeline'},b.history.map(x=>`${x.status} (${x.at})`).join(' → ')),
   h('div',{class:'actions'},acts.map(([k,a])=>h('button',{class:['reject','cancel','failed','dispute'].includes(k)?'bad':k==='approve'||k==='delivered'||k==='confirm'?'good':'',onclick:()=>act(b,k,a)},a.label))));}
 async function act(b,k,a){try{
  if(a.needs==='reason')await openForm({title:a.label+' – #'+b.id,ok:a.label,fields:[{name:'reason',label:'Reason',type:'select',options:S.rules.failReasons.map(x=>[x,x])}],submit:v=>api('PATCH','/api/bookings/'+b.id,{action:k,reason:v.reason})});
  else if(a.needs==='assign'){const [t,d]=await Promise.all([api('GET','/api/tankers'),api('GET','/api/drivers')]);
   const tk=t.filter(x=>x.hydrantId===b.hydrantId&&x.size===b.size&&x.available);
   if(!tk.length)return toast('No available tanker of '+b.size+' gal',true);
   await openForm({title:'Assign #'+b.id,ok:'Assign',fields:[{name:'tankerId',label:'Tanker',type:'select',options:tk.map(x=>[x.id,`${x.plate} (${x.size} gal)`])},{name:'driverId',label:'Driver',type:'select',options:d.filter(x=>x.hydrantId===b.hydrantId).map(x=>[x.id,x.name])}],
    submit:v=>api('PATCH','/api/bookings/'+b.id,{action:k,tankerId:+v.tankerId,driverId:+v.driverId})});}
  else await api('PATCH','/api/bookings/'+b.id,{action:k});
  toast(a.label+' done');draw();}catch(x){toast(x.message,true);}}
 draw();}

/* ---- Customer: new booking ---- */
async function newBooking(){const [hy,rates,me]=await Promise.all([api('GET','/api/hydrants'),api('GET','/api/rates'),api('GET','/api/me')]);
 const u=me.user,mine=hy.filter(x=>x.zoneIds.includes(u.zoneId)&&x.available),can=u.subsidy==='VERIFIED'&&me.monthUsed<u.monthlyLimit;
 const price=h('p',{class:'hint'},''),errs=h('p',{class:'err'});
 const f=h('form',{class:'card',novalidate:true,style:'max-width:520px'},h('h1',{},'New booking'),
  h('label',{for:'bt'},'Booking type',h('select',{id:'bt'},h('option',{value:'COMMERCIAL'},'Commercial'),h('option',{value:'SUBSIDISED',disabled:!can},'Subsidised'+(can?'':' (not available)')))),
  h('p',{class:'hint'},u.subsidy==='VERIFIED'?`Subsidy used this month: ${me.monthUsed}/${u.monthlyLimit}`:'Subsidy status: '+u.subsidy),
  h('label',{for:'bs'},'Tanker size',h('select',{id:'bs'},S.rules.sizes.map(s=>h('option',{value:s},s+' gallons')))),
  h('label',{for:'bh'},'Hydrant',h('select',{id:'bh'},mine.map(x=>h('option',{value:x.id},`${x.name} (${x.open}-${x.close})`)))),
  h('label',{for:'bd'},'Date',h('input',{id:'bd',type:'date',min:today()})),h('label',{for:'bm'},'Time',h('input',{id:'bm',type:'time'})),
  h('label',{for:'ba'},'Delivery address',h('textarea',{id:'ba',rows:2},u.address)),price,errs,h('button',{type:'submit'},'Book tanker'));
 const upd=()=>price.textContent='Amount: '+money(rates[$('#bt').value.toLowerCase()][$('#bs').value]);
 f.onsubmit=async e=>{e.preventDefault();const v={type:$('#bt').value,size:+$('#bs').value,hydrantId:+$('#bh').value,date:$('#bd').value,time:$('#bm').value,address:$('#ba').value.trim()},m={};
  if(!v.hydrantId)m.hydrantId='No hydrant available for your zone';if(!v.date||v.date<today())m.date='Choose today or a future date';if(!v.time)m.time='Choose a time';
  if(v.address.length<10)m.address='Address too short';Object.assign(m,VARIATION(v,'booking'));
  if(Object.keys(m).length)return errs.textContent=Object.values(m).join(' · ');
  try{await api('POST','/api/bookings',v);toast('Booking created');go('bookings');}catch(x){errs.textContent=Object.values(x.errors||{message:x.message}).join(' · ');}};
 $('#main').replaceChildren(f);f.addEventListener('change',upd);upd();}

/* ---- Subsidy (customer applies, officer verifies) ---- */
async function subsidyView(){const role=S.user.role,rows=await api('GET','/api/subsidy'),box=h('div',{class:'grid'});
 const decide=async(id,d)=>{try{await api('PATCH','/api/subsidy/'+id,{decision:d});toast('Application '+d+'d');go('subsidy');}catch(x){toast(x.message,true);}};
 const sc=s=>h('article',{class:'card'},h('h3',{},s.userName+' ',h('span',{class:'badge '+s.status},s.status)),h('p',{},'Category: '+s.category),h('p',{},'Proof: '+s.proof),
  role==='officer'&&s.status==='PENDING'?h('div',{class:'actions'},h('button',{class:'good',onclick:()=>decide(s.id,'approve')},'Approve'),h('button',{class:'bad',onclick:()=>decide(s.id,'reject')},'Reject')):null);
 const draw=rs=>box.replaceChildren(...(rs.length?rs.map(sc):[h('p',{},'No applications.')]));
 draw(rows);const top=[h('h1',{},role==='customer'?'Subsidised status':'Subsidy applications')];
 if(role==='customer')top.push(h('p',{},'Your status: ',h('span',{class:'badge '+S.user.subsidy},S.user.subsidy)),h('button',{onclick:()=>openForm({title:'Apply for subsidy',fields:[{name:'category',label:'Category',type:'select',options:[['Low income household','Low income household'],['Hospital','Hospital'],['Mosque','Mosque']]},{name:'proof',label:'Proof details (ID, utility bill no., letter ref)',type:'textarea',check:V.min(10)}],
  submit:v=>api('POST','/api/subsidy',v)}).then(async r=>{if(r){const m=await api('GET','/api/me');S.user=m.user;toast('Application sent');go('subsidy');}})},'Apply for subsidy'));
 $('#main').replaceChildren(...top,h('br'),box);}

/* ---- Tankers & hydrants (operator / admin) ---- */
async function resourcesView(){const admin=S.user.role==='admin',[t,hy]=await Promise.all([api('GET','/api/tankers'),api('GET','/api/hydrants')]);
 const mineH=hy.filter(x=>admin||x.id===S.user.hydrantId),tg=(kind,o)=>h('button',{class:o.available?'ghost':'good',onclick:async()=>{try{await api('PATCH',`/api/${kind}/${o.id}`,{available:!o.available});go('resources');}catch(x){toast(x.message,true);}}},o.available?'Mark unavailable':'Mark available');
 $('#main').replaceChildren(h('h1',{},'Hydrants'),h('div',{class:'grid'},mineH.map(x=>h('article',{class:'card'},h('h3',{},x.name,' ',h('span',{class:'badge '+(x.available?'APPROVED':'REJECTED')},x.available?'OPEN':'CLOSED')),
  h('p',{},`Hours ${x.open}-${x.close}`),h('p',{},`Quota used ${x.used.toLocaleString()} / ${x.quota.toLocaleString()} gal`),h('div',{class:'meter'},h('i',{style:`width:${Math.min(100,x.used/x.quota*100)}%`})),
  h('div',{class:'actions'},tg('hydrants',x),admin?h('button',{class:'ghost',onclick:()=>openForm({title:'Daily quota – '+x.name,fields:[{name:'quota',label:'Quota (gallons)',type:'number',value:x.quota,check:v=>+v>0||'Must be > 0'}],submit:v=>api('PATCH','/api/hydrants/'+x.id,{quota:+v.quota})}).then(r=>r&&go('resources'))},'Edit quota'):null)))),
  h('h1',{style:'margin-top:1.5rem'},'Tankers'),admin?h('button',{onclick:()=>openForm({title:'Add tanker',fields:[{name:'plate',label:'Plate',check:V.plate},{name:'size',label:'Size',type:'select',options:S.rules.sizes.map(s=>[s,s+' gal'])},{name:'hydrantId',label:'Hydrant',type:'select',options:hy.map(x=>[x.id,x.name])}],submit:v=>api('POST','/api/tankers',v)}).then(r=>r&&go('resources'))},'+ Add tanker'):'',
  h('div',{class:'grid',style:'margin-top:.8rem'},t.filter(x=>admin||x.hydrantId===S.user.hydrantId).map(x=>h('article',{class:'card'},h('h3',{},x.plate),h('p',{},x.size+' gallons'),h('span',{class:'badge '+(x.available?'APPROVED':'REJECTED')},x.available?'AVAILABLE':'UNAVAILABLE'),h('div',{class:'actions'},tg('tankers',x))))));}

/* ---- Admin report ---- */
async function reportsView(){const r=await api('GET','/api/reports/summary'),max=Math.max(...Object.values(r.byStatus),1);
 $('#main').replaceChildren(h('h1',{},'City report'),h('div',{class:'grid'},h('div',{class:'card'},h('h3',{},'Total bookings'),h('p',{style:'font-size:2rem;margin:0'},r.total)),h('div',{class:'card'},h('h3',{},'Revenue (delivered)'),h('p',{style:'font-size:2rem;margin:0'},money(r.revenue)))),
  h('h2',{},'Bookings by status'),h('div',{class:'bars card'},Object.entries(r.byStatus).map(([k,v])=>h('div',{},`${k.replace('_',' ')}: ${v}`,h('div',{class:'meter'},h('i',{style:`width:${v/max*100}%`}))))),
  h('h2',{},'Hydrant quota usage'),h('div',{class:'bars card'},r.byHydrant.map(x=>h('div',{},`${x.name}: ${x.used.toLocaleString()} / ${x.quota.toLocaleString()} gal`,h('div',{class:'meter'},h('i',{style:`width:${x.used/x.quota*100}%`}))))));}

/* ---- Customer bills ---- */
async function billsView(){const rows=(await api('GET','/api/bookings')).filter(b=>!['CANCELLED','REJECTED'].includes(b.status)),tot=rows.reduce((s,b)=>s+b.amount,0);
 $('#main').replaceChildren(h('h1',{},'My bills'),h('div',{class:'card',style:'overflow-x:auto'},h('table',{class:'tbl'},h('thead',{},h('tr',{},['#','Date','Size','Type','Status','Amount'].map(x=>h('th',{},x)))),
  h('tbody',{},rows.map(b=>h('tr',{},h('td',{},b.id),h('td',{},b.date),h('td',{},b.size+' gal'),h('td',{},b.type),h('td',{},b.status),h('td',{},money(b.amount))))),h('tfoot',{},h('tr',{},h('th',{colspan:5},'Total'),h('th',{},money(tot)))))),
  h('p',{},h('button',{class:'ghost',onclick:()=>print()},'Print bill')));}
/* ---- Admin: zones ---- */
async function zonesView(){const z=await api('GET','/api/zones');
 $('#main').replaceChildren(h('h1',{},'Zones'),h('button',{onclick:()=>openForm({title:'Add zone',fields:[{name:'name',label:'Zone name',check:V.min(3)}],submit:v=>api('POST','/api/zones',v)}).then(r=>r&&go('zones'))},'+ Add zone'),
  h('div',{class:'grid',style:'margin-top:.8rem'},z.map(x=>h('article',{class:'card'},h('h3',{},x.name),h('div',{class:'actions'},h('button',{class:'bad',onclick:async()=>{if(!confirm('Delete '+x.name+'?'))return;try{await api('DELETE','/api/zones/'+x.id);go('zones');}catch(e){toast(e.message,true);}}},'Delete'))))));}
/* ---- Admin: rates ---- */
async function ratesView(){const r=await api('GET','/api/rates'),f=h('form',{class:'card',novalidate:true,style:'max-width:520px'},h('h1',{},'Rates (Rs per tanker)'),h('p',{class:'err',id:'re'}));
 for(const t of ['commercial','subsidised'])for(const s of S.rules.sizes)f.insertBefore(h('label',{for:`r_${t}_${s}`},`${t} – ${s} gal`,h('input',{id:`r_${t}_${s}`,type:'number',min:1,value:r[t][s]})),$('#re')||f.lastChild);
 f.append(h('button',{type:'submit'},'Save rates'));
 f.onsubmit=async e=>{e.preventDefault();const b={commercial:{},subsidised:{}};for(const t of Object.keys(b))for(const s of S.rules.sizes)b[t][s]=+$(`#r_${t}_${s}`).value;
  try{await api('PUT','/api/rates',b);toast('Rates saved');}catch(x){$('#re').textContent=Object.values(x.errors||{m:x.message}).join(' · ');}};
 $('#main').replaceChildren(f);}
/* ---- Admin: users ---- */
async function usersView(){const [u,z,hy]=await Promise.all([api('GET','/api/users'),api('GET','/api/zones'),api('GET','/api/hydrants')]);
 $('#main').replaceChildren(h('h1',{},'Users'),h('button',{onclick:()=>openForm({title:'Add staff user',fields:[{name:'name',label:'Full name',check:V.min(3)},{name:'username',label:'Username',check:V.min(4)},{name:'password',label:'Password',type:'password',check:V.min(4)},
  {name:'role',label:'Role',type:'select',options:['officer','operator','driver','admin'].map(x=>[x,x])},{name:'zoneId',label:'Zone (officer)',type:'select',options:z.map(x=>[x.id,x.name])},{name:'hydrantId',label:'Hydrant (operator / driver)',type:'select',options:hy.map(x=>[x.id,x.name])}],
  submit:v=>api('POST','/api/users',v)}).then(r=>r&&go('users'))},'+ Add user'),
  h('div',{class:'grid',style:'margin-top:.8rem'},u.map(x=>h('article',{class:'card'},h('h3',{},x.name),h('p',{},`@${x.username} · ${x.role}`),
  h('div',{class:'actions'},h('button',{class:'bad',onclick:async()=>{if(!confirm('Delete '+x.username+'?'))return;try{await api('DELETE','/api/users/'+x.id);go('users');}catch(e){toast(e.message,true);}}},'Delete'))))));}
boot();
