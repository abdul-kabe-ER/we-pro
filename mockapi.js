
/* Mock REST API for ClinicQ */
(function () {
  const KEY = 'clinicq-db-v1';
  const TODAY = new Date().toISOString().slice(0, 10);

  const seed = () => ({
    departments: [
      { id: 1, name: 'General Medicine' },
      { id: 2, name: 'Dental' },
      { id: 3, name: 'Pediatrics' }
    ],

    users: [
      {
        id: 1, username: 'patient', password: '1234',
        role: 'patient', name: 'Ali Raza',
        cnic: '4210112345671', phone: '03001234567', age: 29
      },
      {
        id: 2, username: 'patient2', password: '1234',
        role: 'patient', name: 'Sana Malik',
        cnic: '4210198765431', phone: '03211234567', age: 34
      },
      {
        id: 3, username: 'reception', password: '1234',
        role: 'receptionist', name: 'Nida Farooq', active: true
      },
      {
        id: 4, username: 'doctor', password: '1234',
        role: 'doctor', name: 'Dr. Hina Qureshi',
        departmentId: 1, fee: 1500,
        start: '09:00', end: '12:00', slot: 20
      },
      {
        id: 5, username: 'doctor2', password: '1234',
        role: 'doctor', name: 'Dr. Usman Tariq',
        departmentId: 2, fee: 2000,
        start: '14:00', end: '17:00', slot: 30
      },
      {
        id: 6, username: 'admin', password: '1234',
        role: 'admin', name: 'Clinic Admin'
      }
    ],

    appointments: [
      {
        id: 1, patientId: 2, patientName: 'Sana Malik',
        doctorId: 4, doctorName: 'Dr. Hina Qureshi',
        departmentId: 1, date: TODAY, time: '09:00',
        reason: 'Fever and cough since two days',
        fee: 1500, status: 'BOOKED',
        history: [
          { status: 'BOOKED', at: TODAY + ' 08:00', by: 'Sana Malik' }
        ]
      },
      {
        id: 2, patientId: 1, patientName: 'Ali Raza',
        doctorId: 4, doctorName: 'Dr. Hina Qureshi',
        departmentId: 1, date: TODAY, time: '09:20',
        reason: 'Routine blood pressure check',
        fee: 1500, status: 'BOOKED',
        history: [
          { status: 'BOOKED', at: TODAY + ' 08:05', by: 'Ali Raza' }
        ]
      }
    ],

    seq: { appointment: 3 }
  });

  let db = null;

  try {
    db = JSON.parse(localStorage.getItem(KEY));
  } catch (e) {}

  if (!db) db = seed();

  // Compatibility with previously saved demo data
  db.users.forEach(u => {
    if (u.role === 'receptionist' && u.active === undefined) {
      u.active = true;
    }
  });

  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (e) {
      console.error('Could not save ClinicQ data', e);
    }
  };

  const rules = {
    nav: {
      patient: [
        ['appointments', 'My Appointments'],
        ['book', 'Book Appointment']
      ],
      receptionist: [
        ['appointments', 'Appointments'],
        ['queue', "Today's Queue"]
      ],
      doctor: [
        ['appointments', 'My Patients'],
        ['queue', 'Queue']
      ],
      admin: [
        ['reports', 'Reports'],
        ['doctors', 'Doctors'],
        ['departments', 'Departments'],
        ['receptionists', 'Manage Receptionists']
      ]
    },

    actions: {
      cancel: {
        roles: ['patient'], from: ['BOOKED'],
        to: 'CANCELLED', label: 'Cancel'
      },
      checkin: {
        roles: ['receptionist'], from: ['BOOKED'],
        to: 'CHECKED_IN', label: 'Check in'
      },
      noshow: {
        roles: ['receptionist'], from: ['BOOKED'],
        to: 'NO_SHOW', label: 'No show'
      },
      start: {
        roles: ['doctor'], from: ['CHECKED_IN'],
        to: 'IN_CONSULTATION', label: 'Start consultation'
      },
      complete: {
        roles: ['doctor'], from: ['IN_CONSULTATION'],
        to: 'COMPLETED', label: 'Complete & add notes',
        needs: 'notes'
      }
    }
  };

  const ok = (d, s = 200) => ({ s, d });

  const err = (m, s = 400, errors) => ({
    s,
    d: { message: m, errors }
  });

  const now = () =>
    new Date().toISOString().slice(0, 16).replace('T', ' ');

  const pub = u => {
    const { password, ...r } = u;
    return r;
  };

  const active = a =>
    !['CANCELLED', 'NO_SHOW'].includes(a.status);

  function slotsOf(d, date) {
    const out = [];
    const [sh, sm] = d.start.split(':').map(Number);
    const [eh, em] = d.end.split(':').map(Number);

    for (
      let t = sh * 60 + sm;
      t + d.slot <= eh * 60 + em;
      t += d.slot
    ) {
      const time =
        String(Math.floor(t / 60)).padStart(2, '0') +
        ':' +
        String(t % 60).padStart(2, '0');

      out.push({
        time,
        free: !db.appointments.some(a =>
          a.doctorId === d.id &&
          a.date === date &&
          a.time === time &&
          active(a)
        )
      });
    }

    return out;
  }

  function visible(u) {
    const a = db.appointments;

    if (u.role === 'patient')
      return a.filter(x => x.patientId === u.id);

    if (u.role === 'doctor')
      return a.filter(x => x.doctorId === u.id);

    if (u.role === 'receptionist')
      return a.map(({ notes, ...r }) => r);

    return a;
  }

  function handle(m, url, body, tok) {
    const [path, qs] = url.split('?');
    const q = Object.fromEntries(new URLSearchParams(qs || ''));
    let r;

    const user = tok && db.users.find(u => 'tok-' + u.id === tok);

    // Login
    if (m === 'POST' && path === '/api/auth/login') {
      const u = db.users.find(x =>
        x.username === body.username &&
        x.password === body.password
      );

      if (!u)
        return err('Wrong username or password', 401);

      if (u.role === 'receptionist' && u.active === false)
        return err('Your receptionist account is deactivated', 403);

      return ok({ token: 'tok-' + u.id, user: pub(u) });
    }

    // Patient registration
    if (m === 'POST' && path === '/api/auth/register') {
      const e = {};

      if (db.users.some(u => u.username === body.username))
        e.username = 'Username already taken';

      if (db.users.some(u => u.cnic === body.cnic))
        e.cnic = 'CNIC already registered';

      if (Object.keys(e).length)
        return err('Registration failed', 409, e);

      const u = {
        id: Date.now(),
        role: 'patient',
        ...body,
        age: +body.age
      };

      db.users.push(u);
      save();

      return ok(pub(u), 201);
    }

    if (m === 'GET' && path === '/api/departments')
      return ok(db.departments);

    if (m === 'GET' && path === '/api/rules')
      return ok(rules);

    if (!user)
      return err('Please log in', 401);

    // Reject existing tokens for deactivated receptionists
    if (user.role === 'receptionist' && user.active === false)
      return err('Your receptionist account is deactivated', 403);

    if (m === 'GET' && path === '/api/me')
      return ok({ user: pub(user) });

    if (m === 'GET' && path === '/api/doctors') {
      let l = db.users.filter(u => u.role === 'doctor');

      if (q.dept)
        l = l.filter(d => d.departmentId == q.dept);

      return ok(l.map(pub));
    }

    if (m === 'GET' && path === '/api/slots') {
      const d = db.users.find(x =>
        x.id == q.doctorId && x.role === 'doctor'
      );

      if (!d)
        return err('Doctor not found', 404);

      return ok(slotsOf(d, q.date));
    }

    if (m === 'GET' && path === '/api/appointments') {
      let l = visible(user);

      if (q.status)
        l = l.filter(a => a.status === q.status);

      if (q.date)
        l = l.filter(a => a.date === q.date);

      if (q.q)
        l = l.filter(a =>
          (a.patientName + a.doctorName + a.reason + a.id)
            .toLowerCase()
            .includes(q.q.toLowerCase())
        );

      return ok(
        [...l].sort((a, b) =>
          (a.date + a.time).localeCompare(b.date + b.time)
        )
      );
    }

    // Book appointment
    if (m === 'POST' && path === '/api/appointments') {
      if (user.role !== 'patient')
        return err('Forbidden', 403);

      const d = db.users.find(x =>
        x.id == body.doctorId && x.role === 'doctor'
      );

      const e = {};

      if (!d) {
        e.doctorId = 'Doctor not found';
      } else {
        const s = slotsOf(d, body.date)
          .find(x => x.time === body.time);

        if (!s)
          e.time = 'Time is outside doctor schedule';
        else if (!s.free)
          e.time = 'Slot already booked';

        if (db.appointments.some(a =>
          a.patientId === user.id &&
          a.doctorId === d.id &&
          a.date === body.date &&
          active(a)
        )) {
          e.doctorId =
            'You already have an appointment with this doctor that day';
        }

        if (db.appointments.some(a =>
          a.patientId === user.id &&
          a.date === body.date &&
          a.time === body.time &&
          active(a)
        )) {
          e.time = 'You have another appointment at this time';
        }
      }

      if (body.date < TODAY)
        e.date = 'Date is in the past';

      if (Object.keys(e).length)
        return err('Booking rejected', 409, e);

      const a = {
        id: db.seq.appointment++,
        patientId: user.id,
        patientName: user.name,
        doctorId: d.id,
        doctorName: d.name,
        departmentId: d.departmentId,
        date: body.date,
        time: body.time,
        reason: body.reason,
        fee: d.fee,
        status: 'BOOKED',
        history: [{
          status: 'BOOKED',
          at: now(),
          by: user.name
        }]
      };

      db.appointments.push(a);
      save();

      return ok(a, 201);
    }

    // Appointment status changes
    if (
      m === 'PATCH' &&
      (r = path.match(/^\/api\/appointments\/(\d+)$/))
    ) {
      const a = db.appointments.find(x => x.id == r[1]);

      if (!a || !visible(user).some(x => x.id === a.id))
        return err('Not found', 404);

      const act = rules.actions[body.action];

      if (!act || !act.roles.includes(user.role))
        return err('Action not allowed for your role', 403);

      if (!act.from.includes(a.status))
        return err(
          `Cannot ${body.action} an appointment that is ${a.status}`,
          409
        );

      if (
        act.needs === 'notes' &&
        (!body.notes || body.notes.trim().length < 10)
      ) {
        return err('Notes required', 422, {
          notes: 'At least 10 characters'
        });
      }

      if (body.action === 'checkin') {
        if (a.date !== TODAY)
          return err('Check-in is only possible on the appointment day', 409);

        a.token = db.appointments.filter(x =>
          x.doctorId === a.doctorId &&
          x.date === a.date &&
          x.token
        ).length + 1;
      }

      if (body.action === 'complete')
        a.notes = body.notes.trim();

      a.status = act.to;
      a.history.push({
        status: a.status,
        at: now(),
        by: user.name
      });

      save();
      return ok(a);
    }

    // Queue
    if (m === 'GET' && path === '/api/queue') {
      if (!['receptionist', 'doctor'].includes(user.role))
        return err('Forbidden', 403);

      return ok(
        db.appointments
          .filter(a =>
            a.date === TODAY &&
            ['CHECKED_IN', 'IN_CONSULTATION'].includes(a.status) &&
            (user.role === 'receptionist' || a.doctorId === user.id)
          )
          .sort((a, b) =>
            a.doctorId - b.doctorId || a.token - b.token
          )
          .map(({ notes, ...x }) => x)
      );
    }

    // Admin-only endpoints
    if (user.role === 'admin') {

      // List receptionists
      if (m === 'GET' && path === '/api/receptionists') {
        return ok(
          db.users
            .filter(u => u.role === 'receptionist')
            .map(pub)
        );
      }

      // Add receptionist
      if (m === 'POST' && path === '/api/receptionists') {
        const e = {};
        const username = String(body.username || '').trim();

        if (!body.name || body.name.trim().length < 3)
          e.name = 'Name must have at least 3 characters';

        if (username.length < 4)
          e.username = 'Username must have at least 4 characters';

        if (!body.password || body.password.length < 4)
          e.password = 'Password must have at least 4 characters';

        if (db.users.some(u => u.username === username))
          e.username = 'Username already taken';

        if (Object.keys(e).length)
          return err('Cannot add receptionist', 409, e);

        const rec = {
          id: Date.now(),
          role: 'receptionist',
          name: body.name.trim(),
          username,
          password: body.password,
          active: true
        };

        db.users.push(rec);
        save();

        return ok(pub(rec), 201);
      }

      // Edit receptionist / change password / activate
      if (
        m === 'PATCH' &&
        (r = path.match(/^\/api\/receptionists\/(\d+)$/))
      ) {
        const rec = db.users.find(u =>
          u.id == r[1] && u.role === 'receptionist'
        );

        if (!rec)
          return err('Receptionist not found', 404);

        if (body.name !== undefined) {
          if (typeof body.name !== 'string' || body.name.trim().length < 3)
            return err('Name must have at least 3 characters', 422);

          rec.name = body.name.trim();
        }

        if (body.username !== undefined) {
          const username = String(body.username).trim();

          if (username.length < 4)
            return err('Username must have at least 4 characters', 422);

          if (db.users.some(u =>
            u.id !== rec.id && u.username === username
          )) {
            return err('Username already taken', 409);
          }

          rec.username = username;
        }

        if (body.password) {
          if (body.password.length < 4)
            return err('Password must have at least 4 characters', 422);

          rec.password = body.password;
        }

        if (typeof body.active === 'boolean')
          rec.active = body.active;

        save();
        return ok(pub(rec));
      }

      // Delete receptionist
      if (
        m === 'DELETE' &&
        (r = path.match(/^\/api\/receptionists\/(\d+)$/))
      ) {
        const index = db.users.findIndex(u =>
          u.id == r[1] && u.role === 'receptionist'
        );

        if (index === -1)
          return err('Receptionist not found', 404);

        db.users.splice(index, 1);
        save();

        return ok({ message: 'Receptionist deleted' });
      }

      // Add department
      if (m === 'POST' && path === '/api/departments') {
        if (db.departments.some(d =>
          d.name.toLowerCase() === body.name.toLowerCase()
        )) {
          return err('Exists', 409, {
            name: 'Department already exists'
          });
        }

        const d = {
          id: Date.now(),
          name: body.name
        };

        db.departments.push(d);
        save();

        return ok(d, 201);
      }

      // Add doctor
      if (m === 'POST' && path === '/api/doctors') {
        const e = {};

        if (db.users.some(u => u.username === body.username))
          e.username = 'Username already taken';

        if (!(body.start < body.end))
          e.end = 'End time must be after start time';

        if (!(+body.fee > 0))
          e.fee = 'Fee must be > 0';

        if (Object.keys(e).length)
          return err('Cannot add doctor', 409, e);

        const d = {
          id: Date.now(),
          role: 'doctor',
          username: body.username,
          password: body.password,
          name: body.name,
          departmentId: +body.departmentId,
          fee: +body.fee,
          start: body.start,
          end: body.end,
          slot: +body.slot
        };

        db.users.push(d);
        save();

        return ok(pub(d), 201);
      }

      // Reports
      if (m === 'GET' && path === '/api/reports/summary') {
        const byStatus = {};

        db.appointments.forEach(a => {
          byStatus[a.status] = (byStatus[a.status] || 0) + 1;
        });

        return ok({
          total: db.appointments.length,
          byStatus,
          revenue: db.appointments
            .filter(a => a.status === 'COMPLETED')
            .reduce((s, a) => s + a.fee, 0),

          byDoctor: db.users
            .filter(u => u.role === 'doctor')
            .map(d => ({
              name: d.name,
              count: db.appointments.filter(a =>
                a.doctorId === d.id && active(a)
              ).length
            }))
        });
      }
    }

    return err('Not found', 404);
  }

  const real = window.fetch.bind(window);

  window.fetch = function (url, opt = {}) {
    if (typeof url !== 'string' || !url.startsWith('/api/'))
      return real(url, opt);

    const tok = (
      (opt.headers || {}).Authorization || ''
    ).replace('Bearer ', '');

    let body = {};

    try {
      body = opt.body ? JSON.parse(opt.body) : {};
    } catch (e) {}

    const { s, d } = handle(
      (opt.method || 'GET').toUpperCase(),
      url,
      body,
      tok
    );

    return new Promise(resolve => {
      setTimeout(() => {
        resolve(new Response(JSON.stringify(d), {
          status: s,
          headers: { 'Content-Type': 'application/json' }
        }));
      }, 120);
    });
  };

  window.resetMockDb = () => {
    localStorage.removeItem(KEY);
    location.reload();
  };

  save();
})();
