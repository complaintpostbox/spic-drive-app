import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import spicDriveLogo from './assets/spicdrive-logo.jpg';
import './App.css';

/* =====================================================
   HELPERS
===================================================== */
function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysBetween(start, end) {
  const s = new Date(start), e = end ? new Date(end) : new Date();
  const sd = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const ed = new Date(e.getFullYear(), e.getMonth(), e.getDate());
  return Math.max(0, Math.floor((ed - sd) / 86400000));
}

/* =====================================================
   LOGIN SCREEN
   Expects a `users` table in Supabase: id, username, password,
   role ('admin' | 'driver'), name, gs_no (nullable, for drivers).
   ⚠ See the migration notes at the bottom of this file re:
   moving password checks server-side (Supabase Auth) before
   going to production with real users.
===================================================== */
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter both username and password.');
      return;
    }
    setLoading(true);
    setError('');

    const { data, error: err } = await supabase
      .from('users')
      .select('*')
      .eq('username', username.trim())
      .eq('password', password)
      .maybeSingle();

    setLoading(false);

    if (err) { setError(err.message); return; }
    if (!data) { setError('Incorrect username or password.'); return; }

    onLogin(data);
  }

  return (
    <div className="loginWrap">
      <div className="loginGlow" />
      <div className="loginCard">
        <div className="loginBadge">
          <img src={spicDriveLogo} alt="SPIC DRIVE" className="loginLogoImg" />
        </div>
        <h1 className="loginBrand">SPIC DRIVE</h1>
        <p className="loginSub">Enterprise Fleet &amp; Workshop Intelligence</p>

        <form onSubmit={submit} className="loginForm">
          <label className="loginLabel">Username</label>
          <div className="loginInputRow">
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter username" autoComplete="username" />
          </div>

          <label className="loginLabel">Password</label>
          <div className="loginInputRow">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" autoComplete="current-password" />
          </div>

          {error && <div className="loginError">⚠ {error}</div>}

          <button className="loginButton" type="submit" disabled={loading}>
            {loading ? <span className="spinner light" /> : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* =====================================================
   DRIVER SCREEN
===================================================== */
function DriverScreen({ currentUser }) {
  const [gsNo, setGsNo] = useState(currentUser.role === 'driver' ? (currentUser.gs_no || '') : '');
  const [employee, setEmployee] = useState(null);
  const [employeeMessage, setEmployeeMessage] = useState('');
  const [employeeLoading, setEmployeeLoading] = useState(false);

  const [vehicleNo, setVehicleNo] = useState('');
  const [vehicle, setVehicle] = useState(null);
  const [vehicleMessage, setVehicleMessage] = useState('');
  const [vehicleLoading, setVehicleLoading] = useState(false);

  const [complaints, setComplaints] = useState(['']);
  const [complaintDate, setComplaintDate] = useState(getTodayString());
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const [myComplaints, setMyComplaints] = useState([]);
  const [myComplaintsLoading, setMyComplaintsLoading] = useState(false);
  const [myComplaintsMessage, setMyComplaintsMessage] = useState('');

  async function loadMyComplaints(employeeId) {
    setMyComplaintsLoading(true);
    setMyComplaintsMessage('');

    const { data: rows, error } = await supabase
      .from('complaint_records')
      .select('*')
      .eq('employee_id', employeeId)
      .order('complaint_date', { ascending: false });

    if (error) {
      setMyComplaintsLoading(false);
      setMyComplaints([]);
      setMyComplaintsMessage('Could not load your complaint history: ' + error.message);
      return;
    }

    const vehicleIds = [...new Set((rows || []).map((r) => r.vehicle_id).filter(Boolean))];
    let vehiclesData = [];
    if (vehicleIds.length > 0) {
      const { data } = await supabase.from('vehicles').select('*').in('id', vehicleIds);
      vehiclesData = data || [];
    }

    setMyComplaints((rows || []).map((r) => ({
      ...r,
      vehicles: vehiclesData.find((v) => v.id === r.vehicle_id) || null,
    })));
    setMyComplaintsLoading(false);
  }

  const myTotal = myComplaints.length;
  const myPending = myComplaints.filter((c) => c.status === 'Pending').length;
  const myCompleted = myComplaints.filter((c) => c.status === 'Completed').length;

  useEffect(() => {
    if (currentUser.role === 'driver' && currentUser.gs_no) findEmployee();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function findEmployee() {
    if (!gsNo.trim()) { setEmployee(null); setEmployeeMessage('Please enter GS No'); return; }
    setEmployeeLoading(true); setEmployeeMessage('');
    const { data, error } = await supabase.from('employees').select('*').eq('gs_no', gsNo.trim()).maybeSingle();
    setEmployeeLoading(false);
    if (error) { setEmployee(null); setEmployeeMessage(error.message); return; }
    if (!data) { setEmployee(null); setEmployeeMessage('Employee not found'); return; }
    setEmployee(data);
    loadMyComplaints(data.id);
  }

  async function findVehicle() {
    if (!vehicleNo.trim()) { setVehicle(null); setVehicleMessage('Please enter Plate No or Asset No'); return; }
    setVehicleLoading(true); setVehicleMessage('');
    const value = vehicleNo.trim();
    const { data, error } = await supabase.from('vehicles').select('*').or(`plate_no.eq.${value},asset_no.eq.${value}`).limit(1).maybeSingle();
    setVehicleLoading(false);
    if (error) { setVehicle(null); setVehicleMessage(error.message); return; }
    if (!data) { setVehicle(null); setVehicleMessage('Vehicle not found'); return; }
    setVehicle(data);
  }

  function addComplaint() { setComplaints([...complaints, '']); }
  function updateComplaint(i, v) { const u = [...complaints]; u[i] = v; setComplaints(u); }
  function removeComplaint(i) { if (complaints.length === 1) return; setComplaints(complaints.filter((_, idx) => idx !== i)); }

  async function submitComplaints() {
    setSaveMessage('');
    if (!employee) return setSaveMessage('Please search and select an employee first.');
    if (!vehicle) return setSaveMessage('Please search and select a vehicle first.');
    if (!complaintDate) return setSaveMessage('Please select a complaint date.');

    const valid = complaints.map((t) => t.trim()).filter(Boolean);
    if (!valid.length) return setSaveMessage('Please enter at least one complaint.');

    setSaving(true);
    const records = valid.map((text) => ({
      employee_id: employee.id, vehicle_id: vehicle.id,
      complaint_text: text, complaint_date: complaintDate, status: 'Pending',
    }));
    const { error } = await supabase.from('complaint_records').insert(records);
    setSaving(false);

    if (error) return setSaveMessage('Save failed: ' + error.message);
    setSaveMessage(`✓ ${valid.length} complaint(s) submitted successfully.`);
    setComplaints(['']);
    setComplaintDate(getTodayString());
    loadMyComplaints(employee.id);
  }

  return (
    <>
      <section className="card">
        <div className="sectionTitle">
          <span className="iconCircle iconIndigo">👤</span>
          <div><h2>Driver Verification</h2><p>Enter GS Number to confirm identity</p></div>
        </div>
        <div className="searchRow">
          <input value={gsNo} onChange={(e) => setGsNo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && findEmployee()} placeholder="Enter GS No" />
          <button className="btnPrimary" onClick={findEmployee}>{employeeLoading ? <span className="spinner" /> : 'Search'}</button>
        </div>
        {employeeMessage && <div className="errorMessage">⚠ {employeeMessage}</div>}
        {employee && (
          <div className="successBox fadeIn">
            <div className="verified"><span className="checkBadge">✓</span> Verified Employee</div>
            <div className="infoGrid">
              <div className="infoRow"><span>Name</span><strong>{employee.name || '-'}</strong></div>
              <div className="infoRow"><span>Designation</span><strong>{employee.designation || '-'}</strong></div>
              <div className="infoRow"><span>Phone</span><strong>{employee.phone || '-'}</strong></div>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <div className="sectionTitle">
          <span className="iconCircle iconGold">🚐</span>
          <div><h2>Vehicle Details</h2><p>Enter Plate No or Asset No</p></div>
        </div>
        <div className="searchRow">
          <input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && findVehicle()} placeholder="Plate No / Asset No" />
          <button className="btnPrimary" onClick={findVehicle}>{vehicleLoading ? <span className="spinner" /> : 'Search'}</button>
        </div>
        {vehicleMessage && <div className="errorMessage">⚠ {vehicleMessage}</div>}
        {vehicle && (
          <div className="successBox fadeIn">
            <div className="verified"><span className="checkBadge">✓</span> Vehicle Found</div>
            <div className="vehicleMain"><strong>{vehicle.plate_no || '-'}</strong><span>{vehicle.equipment_description || '-'}</span></div>
            <div className="infoGrid">
              <div className="infoRow"><span>Asset No</span><strong>{vehicle.asset_no || '-'}</strong></div>
              <div className="infoRow"><span>Make / Model</span><strong>{vehicle.make || '-'} / {vehicle.model || '-'}</strong></div>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <div className="sectionTitle">
          <span className="iconCircle iconAmber">🔧</span>
          <div><h2>Workshop Complaint</h2><p>Add one or more vehicle problems</p></div>
        </div>
        {complaints.map((complaint, index) => (
          <div className="complaintItem" key={index}>
            <div className="complaintHeader">
              <span className="complaintTag">Complaint {index + 1}</span>
              {complaints.length > 1 && <button className="deleteComplaint" onClick={() => removeComplaint(index)}>✕</button>}
            </div>
            <textarea value={complaint} onChange={(e) => updateComplaint(index, e.target.value)} placeholder="Type your problem here..." rows="3" />
          </div>
        ))}
        <div className="dateField">
          <label className="fieldLabel" htmlFor="complaintDate">Complaint Date</label>
          <input id="complaintDate" type="date" value={complaintDate} max={getTodayString()} onChange={(e) => setComplaintDate(e.target.value)} />
        </div>
        <button className="addComplaintButton" onClick={addComplaint}>＋ Add Another Complaint</button>
        <button className="submitButton" onClick={submitComplaints} disabled={saving}>
          {saving ? <span className="spinner light" /> : 'SUBMIT COMPLAINT'}
        </button>
        {saveMessage && <div className="saveMessage fadeIn">{saveMessage}</div>}
      </section>

      <section className="card">
        <div className="sectionTitle">
          <span className="iconCircle iconIndigo">📋</span>
          <div><h2>My Complaints</h2><p>Track the status of everything you've submitted</p></div>
        </div>

        <div className="myStatsRow">
          <div className="myStatChip"><span>Total</span><strong>{myTotal}</strong></div>
          <div className="myStatChip myStatPending"><span>Pending</span><strong>{myPending}</strong></div>
          <div className="myStatChip myStatCompleted"><span>Completed</span><strong>{myCompleted}</strong></div>
        </div>

        {myComplaintsLoading && <p className="loadingText">Loading your complaints...</p>}
        {myComplaintsMessage && <div className="errorMessage">⚠ {myComplaintsMessage}</div>}
        {!myComplaintsLoading && !employee && (
          <div className="emptyState">Verify your GS No above to see your complaint history</div>
        )}
        {!myComplaintsLoading && employee && myTotal === 0 && (
          <div className="emptyState">No complaints submitted yet</div>
        )}

        {myComplaints.map((c) => (
          <div className={c.status === 'Pending' ? 'myComplaintItem' : 'myComplaintItem myCompletedItem'} key={c.id}>
            <div className="myComplaintTop">
              <strong>{c.complaint_text}</strong>
              <span className={c.status === 'Pending' ? 'badge pendingBadge' : 'badge completedBadge'}>{c.status.toUpperCase()}</span>
            </div>
            <div className="myComplaintMeta">
              <span>{c.vehicles?.plate_no || '-'}</span>
              <span>Reported {c.complaint_date}</span>
              {c.status === 'Completed' && c.completed_date && <span>Completed {c.completed_date}</span>}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

/* =====================================================
   ADMIN REPORT (with filters + CSV export + print)
===================================================== */
const FILTER_LABELS = { all: 'All Complaints', pending: 'Pending Complaints', completed: 'Completed Complaints' };

function AdminReport({ complaints, onBack }) {
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    let r = complaints;
    if (filter === 'pending') r = r.filter((c) => c.status === 'Pending');
    if (filter === 'completed') r = r.filter((c) => c.status === 'Completed');
    const s = q.trim().toLowerCase();
    if (s) r = r.filter((c) =>
      (c.vehicles?.plate_no || '').toLowerCase().includes(s) ||
      (c.vehicles?.asset_no || '').toLowerCase().includes(s));
    return r;
  }, [complaints, filter, q]);

  function exportCsv() {
    const header = ['S.No', 'Vehicle', 'Asset No', 'Driver', 'Complaint', 'Complaint Date', 'Completed Date', 'Status', 'Days'];
    const lines = rows.map((c, i) => [
      i + 1, c.vehicles?.plate_no || '-', c.vehicles?.asset_no || '-', c.employees?.name || '-',
      `"${(c.complaint_text || '').replace(/"/g, '""')}"`, c.complaint_date, c.completed_date || '-',
      c.status, daysBetween(c.complaint_date, c.completed_date),
    ].join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `spic-drive-${filter}-report-${getTodayString()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div id="reportPrintArea">
      <div className="reportTopBar noPrint">
        <button className="reportBackButton" onClick={onBack}>← Back to Dashboard</button>
      </div>

      <section className="reportLetterhead">
        <img src={spicDriveLogo} alt="SPIC DRIVE" className="reportLetterheadLogo" />
        <div className="reportLetterheadText">
          <h2>SPIC DRIVE</h2>
          <p>Workshop Complaint Report</p>
        </div>
        <div className="reportLetterheadMeta">
          <span>{FILTER_LABELS[filter]}</span>
          <span>Generated {getTodayString()}</span>
        </div>
      </section>

      <section className="card noPrint">
        <div className="filterTabs">
          <button className={filter === 'all' ? 'filterTab activeFilter' : 'filterTab'} onClick={() => setFilter('all')}>Total (All)</button>
          <button className={filter === 'pending' ? 'filterTab activeFilter' : 'filterTab'} onClick={() => setFilter('pending')}>Pending</button>
          <button className={filter === 'completed' ? 'filterTab activeFilter' : 'filterTab'} onClick={() => setFilter('completed')}>Completed</button>
        </div>
        <div className="reportSearchRow">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by Plate No / Asset No" />
        </div>
        <div className="reportActionsRow">
          <button className="exportCsvButton" onClick={exportCsv}>⬇ Export CSV</button>
          <button className="printReportButton" onClick={() => window.print()}>🖨 Print Report</button>
        </div>
      </section>

      <section className="card">
        <div className="reportTableCaption">
          <span>{FILTER_LABELS[filter]}</span>
          <span className="reportTableCount">{rows.length} record{rows.length === 1 ? '' : 's'}</span>
        </div>
        <div className="reportTableWrapper">
          <table className="reportTable">
            <thead>
              <tr><th>#</th><th>Vehicle</th><th>Driver</th><th className="reportComplaintCell">Complaint</th><th>Complaint Date</th><th>Completed</th><th>Status</th><th>Days</th></tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={c.id}>
                  <td>{i + 1}</td>
                  <td>{c.vehicles?.plate_no || '-'}</td>
                  <td>{c.employees?.name || '-'}</td>
                  <td className="reportComplaintCell">{c.complaint_text}</td>
                  <td>{c.complaint_date}</td>
                  <td>{c.completed_date || '—'}</td>
                  <td><span className={c.status === 'Pending' ? 'badge pendingBadge' : 'badge completedBadge'}>{c.status.toUpperCase()}</span></td>
                  <td>{daysBetween(c.complaint_date, c.completed_date)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: 'var(--slate-500)' }}>No matching records</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* =====================================================
   ADMIN SCREEN
===================================================== */
function AdminScreen({
  adminSearch, setAdminSearch, loadAdminComplaints, adminLoading, adminMessage,
  pending, completed, total, averageRepairDays, allComplaints,
  calculateDays, completedDates, handleCompletedDate, getToday, completeComplaint,
}) {
  const [view, setView] = useState('dashboard');

  if (view === 'report') return <AdminReport complaints={allComplaints} onBack={() => setView('dashboard')} />;

  return (
    <>
      <section className="adminDashboard">
        <div className="dashboardHeader">
          <div><h2>SPIC DRIVE</h2><p>Complaint Overview</p></div>
          <div className="dashboardIcon">📊</div>
        </div>
        <div className="dashboardGrid">
          <div className="dashboardCard"><span className="dot dotRed" /><div><span>Pending</span><strong>{pending.length}</strong></div></div>
          <div className="dashboardCard"><span className="dot dotGreen" /><div><span>Completed</span><strong>{completed.length}</strong></div></div>
          <div className="dashboardCard"><span className="dot dotGold" /><div><span>Total</span><strong>{total}</strong></div></div>
          <div className="dashboardCard"><span className="dot dotIndigo" /><div><span>Avg. Repair</span><strong>{averageRepairDays}d</strong></div></div>
        </div>
        <button className="reportCtaButton" onClick={() => setView('report')}>📋 Open Full Report</button>
      </section>

      <section className="card">
        <div className="sectionTitle">
          <span className="iconCircle iconIndigo">👨‍💼</span>
          <div><h2>Complaint Management</h2><p>Pending &amp; completed complaints</p></div>
        </div>
        <div className="searchRow">
          <input type="text" value={adminSearch} onChange={(e) => setAdminSearch(e.target.value)} placeholder="Filter by Plate No / Asset No" autoComplete="off" />
          <button className="btnPrimary" onClick={loadAdminComplaints}>{adminLoading ? <span className="spinner" /> : 'Refresh'}</button>
        </div>
        {adminMessage && <div className="saveMessage fadeIn">{adminMessage}</div>}
      </section>

      <section className="card">
        <div className="adminSectionTitle"><span>🔴 Pending</span><span className="countBadge pendingCount">{pending.length}</span></div>
        {adminLoading && <p className="loadingText">Loading complaints...</p>}
        {!adminLoading && pending.length === 0 && <div className="emptyState">No pending complaints 🎉</div>}
        {pending.map((complaint) => (
          <div className="adminComplaint" key={complaint.id}>
            <div className="adminComplaintTop"><strong>{complaint.complaint_text}</strong><span className="badge pendingBadge">PENDING</span></div>
            <div className="adminInfoGrid">
              <div className="adminInfo"><span>Vehicle</span><strong>{complaint.vehicles?.plate_no || '-'}</strong></div>
              <div className="adminInfo"><span>Driver</span><strong>{complaint.employees?.name || '-'}</strong></div>
              <div className="adminInfo"><span>Complaint Date</span><strong>{complaint.complaint_date}</strong></div>
            </div>
            <div className="daysBox">⏳ Pending for <strong>{calculateDays(complaint)} Days</strong></div>
            <div className="completeRow">
              <input type="date" value={completedDates[complaint.id] || getToday()} onChange={(e) => handleCompletedDate(complaint.id, e.target.value)} />
              <button className="completeButton" onClick={() => completeComplaint(complaint.id)}>✓ Mark Completed</button>
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <div className="adminSectionTitle"><span>🟢 Completed</span><span className="countBadge completedCount">{completed.length}</span></div>
        {completed.length === 0 && <div className="emptyState">No completed complaints yet</div>}
        {completed.map((complaint) => (
          <div className="adminComplaint completedCard" key={complaint.id}>
            <div className="adminComplaintTop"><strong>{complaint.complaint_text}</strong><span className="badge completedBadge">COMPLETED</span></div>
            <div className="adminInfoGrid">
              <div className="adminInfo"><span>Vehicle</span><strong>{complaint.vehicles?.plate_no || '-'}</strong></div>
              <div className="adminInfo"><span>Complaint Date</span><strong>{complaint.complaint_date}</strong></div>
              <div className="adminInfo"><span>Completed Date</span><strong>{complaint.completed_date}</strong></div>
            </div>
            <div className="daysBox completedDays">✓ Repair Duration: <strong>{calculateDays(complaint)} Days</strong></div>
          </div>
        ))}
      </section>
    </>
  );
}

/* =====================================================
   MAIN APP
===================================================== */
function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [mode, setMode] = useState('driver');

  const [adminSearch, setAdminSearch] = useState('');
  const [adminComplaints, setAdminComplaints] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminMessage, setAdminMessage] = useState('');
  const [completedDates, setCompletedDates] = useState({});

  async function loadAdminComplaints() {
    setAdminMessage('');
    setAdminLoading(true);

    const { data: complaintsData, error: complaintsError } = await supabase
      .from('complaint_records').select('*').order('complaint_date', { ascending: false });

    if (complaintsError) {
      setAdminLoading(false); setAdminComplaints([]);
      setAdminMessage('Load failed: ' + complaintsError.message);
      return;
    }

    const vehicleIds = [...new Set((complaintsData || []).map((i) => i.vehicle_id).filter(Boolean))];
    const employeeIds = [...new Set((complaintsData || []).map((i) => i.employee_id).filter(Boolean))];
    let vehiclesData = [], employeesData = [];

    if (vehicleIds.length > 0) {
      const { data, error } = await supabase.from('vehicles').select('*').in('id', vehicleIds);
      if (error) { setAdminLoading(false); setAdminMessage('Vehicle load failed: ' + error.message); return; }
      vehiclesData = data || [];
    }
    if (employeeIds.length > 0) {
      const { data, error } = await supabase.from('employees').select('*').in('id', employeeIds);
      if (error) { setAdminLoading(false); setAdminMessage('Employee load failed: ' + error.message); return; }
      employeesData = data || [];
    }

    const finalData = (complaintsData || []).map((c) => ({
      ...c,
      vehicles: vehiclesData.find((v) => v.id === c.vehicle_id) || null,
      employees: employeesData.find((e) => e.id === c.employee_id) || null,
    }));
    setAdminComplaints(finalData);
    setAdminLoading(false);
  }

  const searchValue = adminSearch.trim().toLowerCase();
  const visibleComplaints = searchValue
    ? adminComplaints.filter((item) => {
        const plate = item.vehicles?.plate_no?.toString().toLowerCase() || '';
        const asset = item.vehicles?.asset_no?.toString().toLowerCase() || '';
        return plate.includes(searchValue) || asset.includes(searchValue);
      })
    : adminComplaints;

  function calculateDays(complaint) { return daysBetween(complaint.complaint_date, complaint.status === 'Completed' ? complaint.completed_date : null); }

  async function completeComplaint(id) {
    const date = completedDates[id] || getTodayString();
    const { error } = await supabase.from('complaint_records').update({ status: 'Completed', completed_date: date }).eq('id', id);
    if (error) { setAdminMessage('Update failed: ' + error.message); return; }
    setAdminMessage('✓ Complaint completed successfully.');
    loadAdminComplaints();
  }

  function handleCompletedDate(id, date) { setCompletedDates({ ...completedDates, [id]: date }); }

  useEffect(() => {
    if (currentUser?.role === 'admin' && mode === 'admin') loadAdminComplaints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, currentUser]);

  const pending = visibleComplaints.filter((c) => c.status === 'Pending');
  const completed = visibleComplaints.filter((c) => c.status === 'Completed');
  const total = visibleComplaints.length;
  const completedDurations = completed.map((c) => calculateDays(c));
  const averageRepairDays = completedDurations.length
    ? Math.round(completedDurations.reduce((s, d) => s + d, 0) / completedDurations.length) : 0;

  if (!currentUser) return <LoginScreen onLogin={setCurrentUser} />;

  return (
    <div className="app">
      <header className="header">
        <div className="brandRow">
          <div className="logoBadge"><img src={spicDriveLogo} alt="SPIC DRIVE logo" className="logoImg" /></div>
          <div><div className="logo">SPIC DRIVE</div><div className="headerSub">Vehicle Service System</div></div>
        </div>
        <button className="logoutButton" onClick={() => setCurrentUser(null)} title="Sign out">⏻</button>
      </header>

      <div className="roleBar">
        <span className="roleChip">🛡 {currentUser.name} · {currentUser.role === 'admin' ? 'Administrator' : 'Driver'}</span>
      </div>

      {currentUser.role === 'admin' && (
        <div className="modeSwitch">
          <button className={mode === 'driver' ? 'modeButton activeMode' : 'modeButton'} onClick={() => setMode('driver')}>👤 Driver</button>
          <button className={mode === 'admin' ? 'modeButton activeMode' : 'modeButton'} onClick={() => setMode('admin')}>👨‍💼 Admin</button>
        </div>
      )}

      <main className="container">
        {(currentUser.role === 'driver' || mode === 'driver') ? (
          <DriverScreen currentUser={currentUser} />
        ) : (
          <AdminScreen
            adminSearch={adminSearch} setAdminSearch={setAdminSearch}
            loadAdminComplaints={loadAdminComplaints} adminLoading={adminLoading} adminMessage={adminMessage}
            pending={pending} completed={completed} total={total} averageRepairDays={averageRepairDays}
            allComplaints={visibleComplaints}
            calculateDays={calculateDays} completedDates={completedDates}
            handleCompletedDate={handleCompletedDate} getToday={getTodayString} completeComplaint={completeComplaint}
          />
        )}
      </main>

      <footer>SPIC DRIVE • Enterprise Workshop Management</footer>
    </div>
  );
}

export default App;

/* =====================================================
   NOTES FOR PRODUCTION HARDENING (read before go-live)
   ---------------------------------------------------
   1. AUTH: This login checks a plaintext `password` column
      directly from the client — fine for an internal MVP behind
      a private link, NOT safe for anything wider. Before wider
      rollout, migrate to Supabase Auth (email/password or magic
      link) and drive `role` off a `profiles` table keyed to
      auth.uid(), with Row Level Security policies restricting
      writes to `complaint_records` to authenticated users.
   2. Add a `users` table now (username, password, role, name,
      gs_no) to unblock the login screen immediately; treat it as
      a stepping stone to #1.
===================================================== */
