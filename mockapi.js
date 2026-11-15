/* Mock REST API: intercepts fetch('/api/...') so the UI talks to a real-looking API.
   Data is kept in localStorage. In phase 2 delete this file; the same URLs hit the real backend. */
(function(){
const KEY='paanilink-db-v1';
const seed=()=>({
 zones:[{id:1,name:'Gulshan'},{id:2,name:'Korangi'}],
 hydrants:[{id:1,name:'Gulshan Hydrant',zoneIds:[1],quota:30000,used:7000,open:'08:00',close:'18:00',available:true},
           {id:2,name:'Korangi Hydrant',zoneIds:[2],quota:24000,used:0,open:'09:00',close:'17:00',available:true}],
 tankers:[{id:1,hydrantId:1,plate:'KHI-1001',size:1000,available:true},{id:2,hydrantId:1,plate:'KHI-3003',size:3000,available:true},
          {id:3,hydrantId:1,plate:'KHI-6006',size:6000,available:true},{id:4,hydrantId:2,plate:'KHI-3030',size:3000,available:true}],
 rates:{commercial:{1000:2500,3000:6000,6000:10000},subsidised:{1000:600,3000:1500,6000:2500}},
 users:[
  {id:1,username:'customer',password:'1234',role:'customer',name:'Ali Raza',cnic:'4210112345671',phone:'03001234567',address:'House 12, Block 5, Gulshan',zoneId:1,subsidy:'NONE',monthlyLimit:2},
  {id:2,username:'officer',password:'1234',role:'officer',name:'Sara Khan',zoneId:1},
  {id:3,username:'operator',password:'1234',role:'operator',name:'Bilal Ahmed',hydrantId:1},
  {id:4,username:'driver',password:'1234',role:'driver',name:'Imran Shah',hydrantId:1},
  {id:5,username:'driver2',password:'1234',role:'driver',name:'Kamran Ali',hydrantId:1},
  {id:6,username:'admin',password:'1234',role:'admin',name:'Water Board Admin'},
  {id:7,username:'mosque',password:'1234',role:'customer',name:'Masjid Noor',cnic:'4210198765431',phone:'03211234567',address:'Street 4, Gulshan',zoneId:1,subsidy:'VERIFIED',monthlyLimit:2}],
 subsidy:[],
 bookings:[
  {id:1,customerId:7,customerName:'Masjid Noor',zoneId:1,hydrantId:1,size:3000,type:'SUBSIDISED',date:'2026-11-20',time:'10:00',address:'Street 4, Gulshan',amount:1500,status:'PENDING_APPROVAL',history:[{status:'PENDING_APPROVAL',at:'2026-11-14 09:00',by:'Masjid Noor'}]},
  {id:2,customerId:1,customerName:'Ali Raza',zoneId:1,hydrantId:1,size:1000,type:'COMMERCIAL',date:'2026-11-21',time:'11:00',address:'House 12, Block 5, Gulshan',amount:2500,status:'APPROVED',history:[{status:'APPROVED',at:'2026-11-14 10:00',by:'system'}]}],
 seq:{booking:3,subsidy:1,tanker:5}});
let db=null; try{db=JSON.parse(localStorage.getItem(KEY));}catch(e){} if(!db) db=seed();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(db));}catch(e){}};
const rules={
 sizes:[1000,3000,6000],failReasons:['House locked','Road blocked','Customer unavailable'],
 nav:{customer:[['bookings','My Bookings'],['new','New Booking'],['subsidy','Subsidy'],['bills','Bills']],officer:[['bookings','Zone Bookings'],['subsidy','Applications']],
      operator:[['bookings','Hydrant Bookings'],['resources','Tankers']],driver:[['bookings','My Trips']],admin:[['reports','Reports'],['resources','Tankers & Hydrants'],['zones','Zones'],['rates','Rates'],['users','Users']]},
 actions:{
  cancel:{roles:['customer'],from:['PENDING_APPROVAL','APPROVED'],to:'CANCELLED',label:'Cancel'},
  approve:{roles:['officer'],from:['PENDING_APPROVAL'],to:'APPROVED',label:'Approve'},
  reject:{roles:['officer'],from:['PENDING_APPROVAL'],to:'REJECTED',label:'Reject'},
  assign:{roles:['operator'],from:['APPROVED'],to:'ASSIGNED',label:'Assign tanker & driver',needs:'assign'},
  filled:{roles:['operator'],from:['ASSIGNED'],to:'FILLED',label:'Filled & left hydrant'},
  arrived:{roles:['driver'],from:['FILLED'],to:'ARRIVED',label:'Arrived'},
  delivered:{roles:['driver'],from:['ARRIVED'],to:'DELIVERED',label:'Delivered'},
  failed:{roles:['driver'],from:['FILLED','ARRIVED'],to:'FAILED',label:'Failed',needs:'reason'},
  confirm:{roles:['customer'],from:['DELIVERED'],to:'CONFIRMED',label:'Confirm delivery'},
  dispute:{roles:['customer'],from:['DELIVERED'],to:'DISPUTED',label:'Dispute',needs:'reason'},
  resolve:{roles:['officer'],from:['DISPUTED','FAILED'],to:'RESOLVED',label:'Mark resolved'}}};
const ok=(d,s=200)=>({s,d}), err=(m,s=400,errors)=>({s,d:{message:m,errors}});
const now=()=>new Date().toISOString().slice(0,16).replace('T',' ');
const pub=u=>{const {password,...r}=u;return r;};
const monthUsed=u=>db.bookings.filter(b=>b.customerId===u.id&&b.type==='SUBSIDISED'&&!['CANCELLED','REJECTED'].includes(b.status)).length;
function visible(u){const b=db.bookings;
 if(u.role==='customer') return b.filter(x=>x.customerId===u.id).map(({driverId,driverName,...r})=>r);
 if(u.role==='officer') return b.filter(x=>x.zoneId===u.zoneId);
 if(u.role==='operator') return b.filter(x=>x.hydrantId===u.hydrantId);
 if(u.role==='driver') return b.filter(x=>x.driverId===u.id);
 return b;}
function handle(m,url,body,tok){
 const [path,qs]=url.split('?'); const q=Object.fromEntries(new URLSearchParams(qs||'')); let r;
 const user=tok&&db.users.find(u=>'tok-'+u.id===tok);
 if(m==='POST'&&path==='/api/auth/login'){const u=db.users.find(x=>x.username===body.username&&x.password===body.password);
  return u?ok({token:'tok-'+u.id,user:pub(u)}):err('Wrong username or password',401);}
 if(m==='POST'&&path==='/api/auth/register'){const e={};
  if(db.users.some(u=>u.username===body.username)) e.username='Username already taken';
  if(db.users.some(u=>u.cnic===body.cnic)) e.cnic='CNIC already registered';
  if(Object.keys(e).length) return err('Registration failed',409,e);
  const u={id:Date.now(),role:'customer',subsidy:'NONE',monthlyLimit:2,...body}; db.users.push(u); save(); return ok(pub(u),201);}
 if(m==='GET'&&path==='/api/zones') return ok(db.zones);
 if(m==='GET'&&path==='/api/rules') return ok(rules);
 if(!user) return err('Please log in',401);
 if(m==='GET'&&path==='/api/me') return ok({user:pub(db.users.find(u=>u.id===user.id)),monthUsed:monthUsed(user)});
 if(m==='GET'&&path==='/api/rates') return ok(db.rates);
 if(m==='GET'&&path==='/api/hydrants') return ok(db.hydrants);
 if(m==='GET'&&path==='/api/tankers') return ok(db.tankers);
 if(m==='GET'&&path==='/api/drivers') return ok(db.users.filter(u=>u.role==='driver').map(pub));
 if(m==='GET'&&path==='/api/bookings'){let l=visible(user);
  if(q.status) l=l.filter(b=>b.status===q.status);
  if(q.q) l=l.filter(b=>(b.address+b.customerName+b.id).toLowerCase().includes(q.q.toLowerCase()));
  l=[...l].sort((a,b)=>b.id-a.id); return ok(l);}
 if(m==='POST'&&path==='/api/bookings'){ if(user.role!=='customer') return err('Forbidden',403);
  const e={},h=db.hydrants.find(x=>x.id==body.hydrantId),size=+body.size;
  if(!h||!h.zoneIds.includes(user.zoneId)) e.hydrantId='Hydrant does not serve your zone';
  else if(!h.available) e.hydrantId='Hydrant unavailable';
  if(!rules.sizes.includes(size)) e.size='Invalid tanker size';
  if(h&&(body.time<h.open||body.time>h.close)) e.time=`Hydrant works ${h.open}-${h.close}`;
  if(body.type==='SUBSIDISED'){ if(user.subsidy!=='VERIFIED') e.type='Subsidy not verified';
   else if(monthUsed(user)>=user.monthlyLimit) e.type='Monthly subsidy limit reached';}
  if(Object.keys(e).length) return err('Booking rejected',422,e);
  const amount=db.rates[body.type.toLowerCase()][size], st=body.type==='SUBSIDISED'?'PENDING_APPROVAL':'APPROVED';
  const b={id:db.seq.booking++,customerId:user.id,customerName:user.name,zoneId:user.zoneId,hydrantId:h.id,size,type:body.type,date:body.date,time:body.time,address:body.address,amount,status:st,history:[{status:st,at:now(),by:user.name}]};
  db.bookings.push(b); save(); return ok(b,201);}
 if(m==='PATCH'&&(r=path.match(/^\/api\/bookings\/(\d+)$/))){
  const b=db.bookings.find(x=>x.id==r[1]); if(!b||!visible(user).some(x=>x.id===b.id)) return err('Not found',404);
  const a=rules.actions[body.action]; if(!a||!a.roles.includes(user.role)) return err('Action not allowed for your role',403);
  if(!a.from.includes(b.status)) return err(`Cannot ${body.action} a booking that is ${b.status}`,409);
  if(a.needs==='reason'&&!body.reason) return err('Reason required',422,{reason:'Required'});
  if(body.action==='assign'){const t=db.tankers.find(x=>x.id==body.tankerId),d=db.users.find(x=>x.id==body.driverId),h=db.hydrants.find(x=>x.id===b.hydrantId),e={};
   if(!t||!t.available||t.size!==b.size||t.hydrantId!==h.id) e.tankerId='Tanker not usable for this booking';
   if(!d||d.role!=='driver') e.driverId='Invalid driver';
   const busy=x=>db.bookings.some(o=>o.id!==b.id&&o.date===b.date&&o.time===b.time&&['ASSIGNED','FILLED','ARRIVED'].includes(o.status)&&x(o));
   if(t&&busy(o=>o.tankerId===t.id)) e.tankerId='Tanker already promised at this time';
   if(d&&busy(o=>o.driverId===d.id)) e.driverId='Driver already promised at this time';
   if(h.used+b.size>h.quota) e.hydrantId='Hydrant daily quota exceeded';
   if(Object.keys(e).length) return err('Cannot assign',409,e);
   h.used+=b.size; Object.assign(b,{tankerId:t.id,tankerPlate:t.plate,driverId:d.id,driverName:d.name});}
  if(body.reason) b.reason=body.reason; b.status=a.to; b.history.push({status:b.status,at:now(),by:user.name}); save(); return ok(b);}
 if(path==='/api/subsidy'){ if(m==='GET'){const l=user.role==='customer'?db.subsidy.filter(s=>s.userId===user.id):user.role==='officer'?db.subsidy.filter(s=>s.zoneId===user.zoneId):db.subsidy; return ok(l);}
  if(m==='POST'&&user.role==='customer'){ if(db.subsidy.some(s=>s.userId===user.id&&s.status==='PENDING')) return err('You already have a pending application',409);
   const s={id:db.seq.subsidy++,userId:user.id,userName:user.name,zoneId:user.zoneId,category:body.category,proof:body.proof,status:'PENDING'}; db.subsidy.push(s); db.users.find(u=>u.id===user.id).subsidy='PENDING'; save(); return ok(s,201);}}
 if(m==='PATCH'&&(r=path.match(/^\/api\/subsidy\/(\d+)$/))){ if(user.role!=='officer') return err('Forbidden',403);
  const s=db.subsidy.find(x=>x.id==r[1]); if(!s||s.zoneId!==user.zoneId) return err('Not found',404);
  s.status=body.decision==='approve'?'VERIFIED':'REJECTED'; db.users.find(u=>u.id===s.userId).subsidy=s.status; save(); return ok(s);}
 if(m==='PATCH'&&(r=path.match(/^\/api\/(tankers|hydrants)\/(\d+)$/))){ if(!['operator','admin'].includes(user.role)) return err('Forbidden',403);
  const o=db[r[1]].find(x=>x.id==r[2]); if(!o) return err('Not found',404);
  if(user.role==='operator'&&(r[1]==='tankers'?o.hydrantId:o.id)!==user.hydrantId) return err('Not your hydrant',403);
  if('available' in body) o.available=!!body.available; if(user.role==='admin'&&'quota' in body){ if(!(body.quota>0)) return err('Quota must be positive',422,{quota:'Must be > 0'}); o.quota=+body.quota;} save(); return ok(o);}
 if(m==='POST'&&path==='/api/tankers'){ if(user.role!=='admin') return err('Forbidden',403);
  if(db.tankers.some(t=>t.plate===body.plate)) return err('Plate exists',409,{plate:'Already registered'});
  const t={id:db.seq.tanker++,hydrantId:+body.hydrantId,plate:body.plate,size:+body.size,available:true}; db.tankers.push(t); save(); return ok(t,201);}

 if(user.role==='admin'){let z;
  if(m==='GET'&&path==='/api/users') return ok(db.users.map(pub));
  if(m==='POST'&&path==='/api/users'){const e={};if(db.users.some(u=>u.username===body.username))e.username='Username already taken';
   if(!['officer','operator','driver','admin'].includes(body.role))e.role='Invalid role';if(Object.keys(e).length)return err('Cannot create user',409,e);
   const u={id:Date.now(),password:body.password,username:body.username,name:body.name,role:body.role};
   if(body.role==='officer')u.zoneId=+body.zoneId;if(body.role==='operator'||body.role==='driver')u.hydrantId=+body.hydrantId;db.users.push(u);save();return ok(pub(u),201);}
  if(m==='DELETE'&&(z=path.match(/^\/api\/users\/(\d+)$/))){if(+z[1]===user.id)return err('You cannot delete yourself',409);
   if(db.bookings.some(b=>b.customerId==z[1]||b.driverId==z[1]))return err('User has bookings; cannot delete',409);db.users=db.users.filter(u=>u.id!=z[1]);save();return ok({deleted:true});}
  if(m==='POST'&&path==='/api/zones'){if(db.zones.some(x=>x.name.toLowerCase()===body.name.toLowerCase()))return err('Zone exists',409,{name:'Already exists'});
   const n={id:Date.now(),name:body.name};db.zones.push(n);save();return ok(n,201);}
  if(m==='DELETE'&&(z=path.match(/^\/api\/zones\/(\d+)$/))){if(db.hydrants.some(h=>h.zoneIds.includes(+z[1]))||db.users.some(u=>u.zoneId==z[1]))return err('Zone is in use',409);db.zones=db.zones.filter(x=>x.id!=z[1]);save();return ok({deleted:true});}
  if(m==='PUT'&&path==='/api/rates'){for(const t of ['commercial','subsidised'])for(const s of rules.sizes)if(!(body[t]&&body[t][s]>0))return err('Invalid rate',422,{[t+s]:'Rate must be > 0'});
   if(rules.sizes.some(s=>body.subsidised[s]>=body.commercial[s]))return err('Subsidised rate must be lower than commercial',422,{rate:'Subsidised must be < commercial'});
   db.rates={commercial:body.commercial,subsidised:body.subsidised};save();return ok(db.rates);}}
 if(m==='GET'&&path==='/api/reports/summary'){ if(user.role!=='admin') return err('Forbidden',403);
  const byStatus={}; db.bookings.forEach(b=>byStatus[b.status]=(byStatus[b.status]||0)+1);
  return ok({total:db.bookings.length,byStatus,revenue:db.bookings.filter(b=>['DELIVERED','CONFIRMED','RESOLVED'].includes(b.status)).reduce((s,b)=>s+b.amount,0),byHydrant:db.hydrants.map(h=>({name:h.name,used:h.used,quota:h.quota}))});}
 return err('Not found',404);}
const real=window.fetch.bind(window);
window.fetch=function(url,opt={}){ if(typeof url!=='string'||!url.startsWith('/api/')) return real(url,opt);
 const tok=((opt.headers||{}).Authorization||'').replace('Bearer ',''); let body={}; try{body=opt.body?JSON.parse(opt.body):{};}catch(e){}
 const {s,d}=handle((opt.method||'GET').toUpperCase(),url,body,tok);
 return new Promise(res=>setTimeout(()=>res(new Response(JSON.stringify(d),{status:s,headers:{'Content-Type':'application/json'}})),120));};
window.resetMockDb=()=>{localStorage.removeItem(KEY);location.reload();};
})();
