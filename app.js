
/* ClinicQ frontend */

const S = {
  token: sessionStorage.getItem('tok'),
  user: null,
  rules: null,
  route: 'bookings'
};

const $ = s => document.querySelector(s);

const h = (t, a = {}, ...k) => {
  const e = document.createElement(t);

  for (const [x, v] of Object.entries(a)) {
    if (x === 'class') e.className = v;
    else if (x.startsWith('on')) e[x] = v;
    else if (v !== false && v != null) e.setAttribute(x, v);
  }

  k.flat().forEach(c =>
    e.append(c instanceof Node ? c : document.createTextNode(c ?? ''))
  );

  return e;
};

async function api(method, path, body) {
  const r = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (S.token || '')
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const d = await r.json();

  if (!r.ok) {
    const e = new Error(d.message || 'Error');
    e.errors = d.errors;
    e.status = r.status;
    throw e;
  }

  return d;
}

function toast(m, bad) {
  const t = $('#toast');
  t.textContent = m;
  t.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.className = '', 2800);
}

const money = n => 'Rs ' + Number(n).toLocaleString();
const today = () => new Date().toISOString().slice(0, 10);

/* Validation */

const V = {
  cnic: v => /^\d{13}$/.test(v) || 'CNIC must be 13 digits (no dashes)',
  phone: v => /^03\d{9}$/.test(v) || 'Phone must look like 03001234567',
  min: n => v => v.trim().length >= n || `At least ${n} characters`,
  plate: v => /^[A-Z]{3}-\d{3,4}$/.test(v) || 'Plate like KHI-1234'
};

const VARIATION = () => ({});

/* Generic dialog form */

function openForm({ title, fields, ok = 'Submit', submit }) {
  return new Promise(res => {
    const d = $('#dlg');
    const body = $('#dbody');

    $('#dtitle').textContent = title;
    $('#dok').textContent = ok;
    $('#derr').textContent = '';
    body.innerHTML = '';

    fields.forEach(f => {
      const id = 'f_' + f.name;
      let inp;

      if (f.type === 'select') {
        inp = h('select', { id, name: f.name },
          f.options.map(([v, l]) => h('option', { value: v }, l))
        );
      } else if (f.type === 'textarea') {
        inp = h('textarea', { id, name: f.name, rows: 3 });
      } else {
        inp = h('input', {
          id,
          name: f.name,
          type: f.type || 'text',
          min: f.min,
          max: f.max,
          autocomplete: f.auto || 'off'
        });
      }

      if (f.value != null) inp.value = f.value;
      if (f.onchange) inp.onchange = () => f.onchange(inp);

      body.append(h('label', { for: id }, f.label, inp));
    });

    const close = v => {
      d.close();
      res(v);
    };

    $('#dcancel').onclick = () => close(null);

    $('#dform').onsubmit = async e => {
      e.preventDefault();

      const vals = {};
      const errs = {};

      fields.forEach(f => {
        const el = $('#f_' + f.name);
        vals[f.name] = el.value;
        el.classList.remove('invalid');

        if (f.required !== false && !String(el.value).trim()) {
          errs[f.name] = f.label + ' is required';
        } else if (f.check && String(el.value).trim()) {
          const result = f.check(el.value);
          if (result !== true) errs[f.name] = result;
        }
      });

      Object.assign(errs, VARIATION(vals, title));

      const show = m => {
        Object.keys(m).forEach(k => {
          if ($('#f_' + k)) $('#f_' + k).classList.add('invalid');
        });

        $('#derr').textContent = Object.values(m).join(' · ');
      };

      if (Object.keys(errs).length) return show(errs);

      try {
        await submit(vals);
        close(vals);
      } catch (x) {
        if (x.errors) show(x.errors);
        else $('#derr').textContent = x.message;
      }
    };

    d.showModal();
  });
}

/* Authentication */

async function boot() {
  S.rules = await api('GET', '/api/rules');

  if (S.token) {
    try {
      const m = await api('GET', '/api/me');
      S.user = m.user;
    } catch (e) {
      S.token = null;
      sessionStorage.removeItem('tok');
    }
  }

  S.user ? shell() : loginView();
}

function loginView() {
  $('#nav').innerHTML = '';
  $('#who').textContent = '';
  $('#logout').hidden = true;

  const f = h('form', {
    class: 'card login',
    novalidate: true,
    onsubmit: async e => {
      e.preventDefault();

      const u = $('#lu').value.trim();
      const p = $('#lp').value;

      if (!u || !p)
        return $('#le').textContent = 'Enter username and password';

      try {
        const r = await api('POST', '/api/auth/login', {
          username: u,
          password: p
        });

        S.token = r.token;
        sessionStorage.setItem('tok', r.token);
        await boot();

      } catch (x) {
        $('#le').textContent = x.message;
      }
    }
  },
    h('h1', {}, 'ClinicQ Login'),

    h('label', { for: 'lu' }, 'Username',
      h('input', { id: 'lu', autocomplete: 'username' })
    ),

    h('label', { for: 'lp' }, 'Password',
      h('input', {
        id: 'lp',
        type: 'password',
        autocomplete: 'current-password'
      })
    ),

    h('p', { class: 'err', id: 'le' }),

    h('div', { class: 'actions' },
      h('button', { type: 'submit' }, 'Login'),
      h('button', {
        type: 'button',
        class: 'ghost',
        onclick: registerForm
      }, 'Register as patient')
    ),

    h('p', { class: 'hint' },
      'Demo users (password 1234): patient, patient2, reception, doctor, doctor2, admin'
    )
  );

  $('#main').replaceChildren(f);
}

function registerForm() {
  return openForm({
    title: 'Patient registration',
    ok: 'Register',

    fields: [
      { name: 'name', label: 'Full name', check: V.min(3) },
      { name: 'cnic', label: 'CNIC', check: V.cnic },
      { name: 'phone', label: 'Phone', check: V.phone },
      {
        name: 'age',
        label: 'Age',
        type: 'number',
        check: v => (+v >= 0 && +v <= 120) || 'Age must be 0-120'
      },
      { name: 'username', label: 'Username', check: V.min(4) },
      {
        name: 'password',
        label: 'Password',
        type: 'password',
        check: V.min(4)
      }
    ],

    submit: async v => {
      await api('POST', '/api/auth/register', v);
      toast('Registered. You can log in now.');
    }
  });
}

$('#logout').onclick = () => {
  sessionStorage.removeItem('tok');
  S.token = null;
  S.user = null;
  loginView();
};

/* Dashboard navigation */

function shell() {
  const nav = S.rules.nav[S.user.role];

  $('#who').textContent = `${S.user.name} (${S.user.role})`;
  $('#logout').hidden = false;

  S.route = nav[0][0];

  drawNav();
  go(S.route);
}

function drawNav() {
  $('#nav').replaceChildren(
    ...S.rules.nav[S.user.role].map(([r, l]) =>
      h('a', {
        href: '#' + r,
        class: r === S.route ? 'on' : '',
        onclick: e => {
          e.preventDefault();
          go(r);
        }
      }, l)
    )
  );
}

async function go(r) {
  S.route = r;
  drawNav();

  $('#main').replaceChildren(h('p', {}, 'Loading…'));

  try {
    const views = {
      appointments: apptView,
      book: bookView,
      queue: queueView,
      reports: reportsView,
      doctors: doctorsView,
      departments: deptView,
      receptionists: receptionistsView
    };

    if (!views[r]) throw new Error('Page not found');

    await views[r]();

  } catch (e) {
    $('#main').replaceChildren(
      h('p', { class: 'err' }, e.message)
    );
  }
}

/* Appointments */

async function apptView() {
  const role = S.user.role;
  let status = '';
  let q = '';
  let date = '';

  const list = h('div', { class: 'grid' });

  const draw = async () => {
    const p = new URLSearchParams();

    if (status) p.set('status', status);
    if (q) p.set('q', q);
    if (date) p.set('date', date);

    const rows = await api('GET', '/api/appointments?' + p);

    list.replaceChildren(
      ...(rows.length ? rows.map(card) : [
        h('p', {}, 'No appointments found.')
      ])
    );
  };

  const sts = [
    ...new Set(
      Object.values(S.rules.actions).map(a => a.to).concat('BOOKED')
    )
  ];

  const st = h('select', {
    'aria-label': 'Filter by status',
    onchange: e => {
      status = e.target.value;
      draw();
    }
  },
    h('option', { value: '' }, 'All statuses'),
    sts.map(s => h('option', { value: s }, s))
  );

  const dt = h('input', {
    type: 'date',
    'aria-label': 'Filter by date',
    onchange: e => {
      date = e.target.value;
      draw();
    }
  });

  const se = h('input', {
    type: 'search',
    'aria-label': 'Search',
    placeholder: 'Search patient, doctor, reason',
    oninput: e => {
      q = e.target.value;
      clearTimeout(se.t);
      se.t = setTimeout(draw, 250);
    }
  });

  $('#main').replaceChildren(
    h('h1', {}, 'Appointments'),
    h('div', { class: 'bar' }, se, dt, st),
    list
  );

  function card(a) {
    const acts = Object.entries(S.rules.actions)
      .filter(([k, x]) =>
        x.roles.includes(role) && x.from.includes(a.status)
      );

    return h('article', { class: 'card' },

      h('h3', {},
        `#${a.id} · ${a.time} `,
        h('span', {
          class: 'badge ' + a.status
        }, a.status.replace('_', ' '))
      ),

      h('p', {}, `📅 ${a.date}`),

      role !== 'patient'
        ? h('p', {}, '👤 ' + a.patientName)
        : null,

      role !== 'doctor'
        ? h('p', {}, '🩺 ' + a.doctorName)
        : null,

      h('p', {}, 'Reason: ' + a.reason),
      h('p', {}, 'Fee: ' + money(a.fee)),

      a.token
        ? h('p', {}, 'Queue token: ', h('b', {}, '#' + a.token))
        : null,

      a.notes ? h('p', {}, '📝 Notes: ' + a.notes) : null,

      h('div', { class: 'timeline' },
        a.history.map(x =>
          `${x.status} (${x.at})`
        ).join(' → ')
      ),

      h('div', { class: 'actions' },
        acts.map(([k, x]) =>
          h('button', {
            class:
              k === 'cancel' || k === 'noshow'
                ? 'bad'
                : k === 'checkin' || k === 'complete'
                  ? 'good'
                  : '',
            onclick: () => act(a, k, x)
          }, x.label)
        )
      )
    );
  }

  async function act(a, k, x) {
    try {
      if (x.needs === 'notes') {
        const result = await openForm({
          title: 'Consultation notes – #' + a.id,
          ok: 'Complete',

          fields: [{
            name: 'notes',
            label: 'Diagnosis / prescription',
            type: 'textarea',
            check: V.min(10)
          }],

          submit: v =>
            api('PATCH', '/api/appointments/' + a.id, {
              action: k,
              notes: v.notes
            })
        });

        if (!result) return;

      } else {
        if (k === 'cancel' && !confirm('Cancel this appointment?'))
          return;

        await api('PATCH', '/api/appointments/' + a.id, {
          action: k
        });
      }

      toast(x.label + ' done');
      draw();

    } catch (e) {
      toast(e.message, true);
    }
  }

  draw();
}

/* Patient booking */

async function bookView() {
  const depts = await api('GET', '/api/departments');

  let docs = [];
  let sel = null;

  const slotBox = h('div', { class: 'slots' });
  const err = h('p', { class: 'err' });
  const info = h('p', { class: 'hint' });

  const f = h('form', {
    class: 'card',
    novalidate: true,
    style: 'max-width:560px'
  },

    h('h1', {}, 'Book appointment'),

    h('label', { for: 'bd' }, 'Department',
      h('select', { id: 'bd' },
        depts.map(d => h('option', { value: d.id }, d.name))
      )
    ),

    h('label', { for: 'bo' }, 'Doctor',
      h('select', { id: 'bo' })
    ),

    info,

    h('label', { for: 'bt' }, 'Date',
      h('input', { id: 'bt', type: 'date', min: today() })
    ),

    h('p', {}, 'Available slots'),
    slotBox,

    h('label', { for: 'br' }, 'Reason for visit',
      h('textarea', { id: 'br', rows: 2 })
    ),

    err,
    h('button', { type: 'submit' }, 'Book appointment')
  );

  const loadDocs = async () => {
    docs = await api('GET', '/api/doctors?dept=' + $('#bd').value);

    $('#bo').replaceChildren(
      ...docs.map(d => h('option', { value: d.id }, d.name))
    );

    loadSlots();
  };

  const loadSlots = async () => {
    sel = null;
    slotBox.replaceChildren();

    const d = docs.find(x => x.id == $('#bo').value);
    const date = $('#bt').value;

    info.textContent = d
      ? `Fee ${money(d.fee)} · ${d.start}-${d.end} · ${d.slot} min slots`
      : 'No doctor in this department';

    if (!d || !date) return;

    const sl = await api(
      'GET',
      `/api/slots?doctorId=${d.id}&date=${date}`
    );

    slotBox.replaceChildren(
      ...sl.map(s =>
        h('button', {
          type: 'button',
          disabled: !s.free,
          'aria-label': 'Slot ' + s.time,
          onclick: e => {
            sel = s.time;

            slotBox.querySelectorAll('button').forEach(b =>
              b.classList.remove('sel')
            );

            e.target.classList.add('sel');
          }
        }, s.time)
      )
    );
  };

  $('#main').replaceChildren(f);

  $('#bd').onchange = loadDocs;
  $('#bo').onchange = loadSlots;
  $('#bt').onchange = loadSlots;

  f.onsubmit = async e => {
    e.preventDefault();

    const v = {
      doctorId: +$('#bo').value,
      date: $('#bt').value,
      time: sel,
      reason: $('#br').value.trim()
    };

    const m = {};

    if (!v.doctorId) m.doctorId = 'Choose a doctor';
    if (!v.date || v.date < today())
      m.date = 'Choose today or a future date';
    if (!v.time) m.time = 'Select a time slot';
    if (v.reason.length < 5)
      m.reason = 'Reason is too short';

    Object.assign(m, VARIATION(v, 'booking'));

    if (Object.keys(m).length)
      return err.textContent = Object.values(m).join(' · ');

    try {
      await api('POST', '/api/appointments', v);
      toast('Appointment booked');
      go('appointments');

    } catch (x) {
      err.textContent = Object.values(
        x.errors || { m: x.message }
      ).join(' · ');

      loadSlots();
    }
  };

  loadDocs();
}

/* Queue */

async function queueView() {
  const q = await api('GET', '/api/queue');
  const by = {};

  q.forEach(a =>
    (by[a.doctorName] = by[a.doctorName] || []).push(a)
  );

  $('#main').replaceChildren(
    h('h1', {}, "Today's queue"),

    ...(
      Object.keys(by).length
        ? Object.entries(by).map(([d, l]) =>
            h('section', {},
              h('h2', {}, d),

              h('div', { class: 'grid' },
                l.map(a =>
                  h('article', { class: 'card' },
                    h('span', { class: 'token' }, '#' + a.token),
                    h('p', {}, a.patientName + ' · ' + a.time),
                    h('span', {
                      class: 'badge ' + a.status
                    }, a.status.replace('_', ' '))
                  )
                )
              )
            )
          )
        : [h('p', {}, 'Nobody is waiting right now.')]
    )
  );
}

/* Admin reports */

async function reportsView() {
  const r = await api('GET', '/api/reports/summary');

  const max = Math.max(...Object.values(r.byStatus), 1);
  const mx2 = Math.max(...r.byDoctor.map(x => x.count), 1);

  $('#main').replaceChildren(

    h('h1', {}, 'Clinic report'),

    h('div', { class: 'grid' },

      h('div', { class: 'card' },
        h('h3', {}, 'Total appointments'),
        h('p', { style: 'font-size:2rem;margin:0' }, r.total)
      ),

      h('div', { class: 'card' },
        h('h3', {}, 'Revenue (completed)'),
        h('p', { style: 'font-size:2rem;margin:0' }, money(r.revenue))
      )
    ),

    h('h2', {}, 'By status'),

    h('div', { class: 'bars card' },
      Object.entries(r.byStatus).map(([k, v]) =>
        h('div', {},
          `${k.replace('_', ' ')}: ${v}`,
          h('div', { class: 'meter' },
            h('i', { style: `width:${v / max * 100}%` })
          )
        )
      )
    ),

    h('h2', {}, 'Active appointments per doctor'),

    h('div', { class: 'bars card' },
      r.byDoctor.map(x =>
        h('div', {},
          `${x.name}: ${x.count}`,
          h('div', { class: 'meter' },
            h('i', { style: `width:${x.count / mx2 * 100}%` })
          )
        )
      )
    )
  );
}

/* Doctors */

async function doctorsView() {
  const [d, dp] = await Promise.all([
    api('GET', '/api/doctors'),
    api('GET', '/api/departments')
  ]);

  const nm = id => (dp.find(x => x.id === id) || {}).name;

  $('#main').replaceChildren(

    h('h1', {}, 'Doctors'),

    h('button', {
      onclick: () =>
        openForm({
          title: 'Add doctor',
          ok: 'Add',

          fields: [
            { name: 'name', label: 'Full name', check: V.min(3) },
            { name: 'username', label: 'Username', check: V.min(4) },
            {
              name: 'password',
              label: 'Password',
              type: 'password',
              check: V.min(4)
            },
            {
              name: 'departmentId',
              label: 'Department',
              type: 'select',
              options: dp.map(x => [x.id, x.name])
            },
            {
              name: 'fee',
              label: 'Fee (Rs)',
              type: 'number',
              check: v => +v > 0 || 'Fee must be > 0'
            },
            { name: 'start', label: 'Start time', type: 'time' },
            { name: 'end', label: 'End time', type: 'time' },
            {
              name: 'slot',
              label: 'Slot length',
              type: 'select',
              options: [
                [15, '15 min'],
                [20, '20 min'],
                [30, '30 min']
              ]
            }
          ],

          submit: v => api('POST', '/api/doctors', v)

        }).then(r => r && go('doctors'))
    }, '+ Add doctor'),

    h('div', {
      class: 'grid',
      style: 'margin-top:.8rem'
    },
      d.map(x =>
        h('article', { class: 'card' },
          h('h3', {}, x.name),
          h('p', {}, nm(x.departmentId)),
          h('p', {}, `${x.start}-${x.end} · ${x.slot} min slots`),
          h('p', {}, 'Fee ' + money(x.fee))
        )
      )
    )
  );
}

/* Departments */

async function deptView() {
  const dp = await api('GET', '/api/departments');

  $('#main').replaceChildren(

    h('h1', {}, 'Departments'),

    h('button', {
      onclick: () =>
        openForm({
          title: 'Add department',
          fields: [
            { name: 'name', label: 'Department name', check: V.min(3) }
          ],
          submit: v => api('POST', '/api/departments', v)
        }).then(r => r && go('departments'))
    }, '+ Add department'),

    h('div', {
      class: 'grid',
      style: 'margin-top:.8rem'
    },
      dp.map(x =>
        h('article', { class: 'card' },
          h('h3', {}, x.name)
        )
      )
    )
  );
}

/* Receptionist management */

async function receptionistsView() {

  const load = async () => {
    const data = await api('GET', '/api/receptionists');

    const list = h('div', { class: 'grid' });

    list.replaceChildren(
      ...(data.length
        ? data.map(r =>
            h('article', { class: 'card' },

              h('h3', {}, r.name),

              h('p', {}, 'Username: ' + r.username),

              h('p', {}, 'Role: Receptionist'),

              h('p', {},
                'Status: ' +
                (r.active === false ? 'Inactive' : 'Active')
              ),

              h('div', { class: 'actions' },

                h('button', {
                  class: 'ghost',
                  onclick: () => editReceptionist(r)
                }, 'Edit'),

                h('button', {
                  class: r.active === false ? 'good' : 'ghost',
                  onclick: () => toggleReceptionist(r)
                },
                  r.active === false ? 'Activate' : 'Deactivate'
                ),

                h('button', {
                  class: 'bad',
                  onclick: () => deleteReceptionist(r)
                }, 'Delete')

              )
            )
          )
        : [h('p', {}, 'No receptionists found.')]
      )
    );

    $('#main').replaceChildren(

      h('h1', {}, 'Manage Receptionists'),

      h('p', { class: 'hint' },
        'Add, edit, activate, deactivate or remove receptionists.'
      ),

      h('button', {
        onclick: addReceptionist
      }, '+ Add Receptionist'),

      h('div', {
        class: 'grid',
        style: 'margin-top:1rem'
      }, list)
    );
  };

  async function addReceptionist() {
    const result = await openForm({

      title: 'Add Receptionist',
      ok: 'Add Receptionist',

      fields: [
        { name: 'name', label: 'Full Name', check: V.min(3) },
        { name: 'username', label: 'Username', check: V.min(4) },
        {
          name: 'password',
          label: 'Password',
          type: 'password',
          check: V.min(4)
        }
      ],

      submit: v => api('POST', '/api/receptionists', v)
    });

    if (result) {
      toast('Receptionist added successfully');
      await load();
    }
  }

  async function editReceptionist(r) {
    const result = await openForm({

      title: 'Edit Receptionist',
      ok: 'Save Changes',

      fields: [
        {
          name: 'name',
          label: 'Full Name',
          value: r.name,
          check: V.min(3)
        },
        {
          name: 'username',
          label: 'Username',
          value: r.username,
          check: V.min(4)
        },
        {
          name: 'password',
          label: 'New Password (leave blank to keep old password)',
          type: 'password',
          required: false,
          check: v => !v || v.length >= 4 || 'At least 4 characters'
        }
      ],

      submit: v => {
        const data = {
          name: v.name,
          username: v.username
        };

        if (v.password)
          data.password = v.password;

        return api('PATCH', '/api/receptionists/' + r.id, data);
      }
    });

    if (result) {
      toast('Receptionist updated successfully');
      await load();
    }
  }

  async function toggleReceptionist(r) {
    const activate = r.active === false;

    if (!confirm(
      activate
        ? 'Activate this receptionist?'
        : 'Deactivate this receptionist?'
    )) return;

    try {
      await api('PATCH', '/api/receptionists/' + r.id, {
        active: activate
      });

      toast(
        activate
          ? 'Receptionist activated'
          : 'Receptionist deactivated'
      );

      await load();

    } catch (e) {
      toast(e.message, true);
    }
  }

  async function deleteReceptionist(r) {
    if (!confirm(
      'Are you sure you want to delete ' + r.name + '?'
    )) return;

    try {
      await api('DELETE', '/api/receptionists/' + r.id);

      toast('Receptionist deleted successfully');

      await load();

    } catch (e) {
      toast(e.message, true);
    }
  }

  await load();
}

boot();
