import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import spicDriveLogo from './assets/spicdrive-logo.jpg';
import './App.css';

/* =====================================================
   HELPERS
===================================================== */
function getTodayString() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function calculateDays(complaint) {
  const start = new Date(complaint.complaint_date);
  const end =
    complaint.status === 'Completed' && complaint.completed_date
      ? new Date(complaint.completed_date)
      : new Date();
  const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const diff = endDate.getTime() - startDate.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

/* The app's signature element: every vehicle identifier renders as a
   mono-spaced "plate chip" so a vehicle reads identically everywhere —
   driver verification, admin lists, and the printed report. */
function PlateChip({ plate }) {
  return <span className="plateChip">{plate || '—'}</span>;
}

/* =====================================================
   LOGIN SCREEN
===================================================== */
function LoginScreen({ username, setUsername, password, setPassword, onLogin, loading, error }) {
  return (
    <div className="loginWrap">
      <div className="loginCard fadeIn">
        <div className="loginLogoRow">
          <div className="loginLogoBadge">
            <img src={spicDriveLogo} alt="SPIC DRIVE logo" />
          </div>
          <div className="loginTitle">SPIC DRIVE</div>
          <div className="loginSub">Vehicle Service &amp; Workshop System</div>
        </div>

        <div className="loginField">
          <label htmlFor="loginUsername">Username</label>
          <input
            id="loginUsername"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onLogin()}
            placeholder="e.g. driver01"
            autoCapitalize="none"
            autoCorrect="off"
          />
        </div>

        <div className="loginField">
          <label htmlFor="loginPassword">Password</label>
          <input
            id="loginPassword"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onLogin()}
            placeholder="••••••••"
          />
        </div>

        <button className="loginButton" onClick={onLogin} disabled={loading}>
          {loading ? <span className="spinner light" /> : 'Sign In'}
        </button>

        {error && <div className="loginError">⚠ {error}</div>}

        <div className="loginFootnote">Access restricted to authorized Gulf Spic personnel</div>
      </div>
    </div>
  );
}

/* =====================================================
   DRIVER SCREEN
===================================================== */
function DriverScreen({
  gsNo, setGsNo, employee, employeeMessage, employeeLoading, findEmployee,
  vehicleNo, setVehicleNo, vehicle, vehicleMessage, vehicleLoading, findVehicle,
  complaintDate, setComplaintDate, maxComplaintDate,
  complaints, updateComplaint, addComplaint, removeComplaint,
  submitComplaints, saving, saveMessage,
}) {
  return (
    <>
      <section className="card">
        <div className="sectionTitle">
          <span className="iconCircle iconBlue">👤</span>
          <div>
            <h2>Driver Details</h2>
            <p>Enter your GS Number to verify identity</p>
          </div>
        </div>

        <div className="searchRow">
          <input
            value={gsNo}
            onChange={(e) => setGsNo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && findEmployee()}
            placeholder="Enter GS No"
          />
          <button className="btnPrimary" onClick={findEmployee}>
            {employeeLoading ? <span className="spinner" /> : 'Search'}
          </button>
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
          <span className="iconCircle iconViolet">🚐</span>
          <div>
            <h2>Vehicle Details</h2>
            <p>Enter Plate No or Asset No</p>
          </div>
        </div>

        <div className="searchRow">
          <input
            value={vehicleNo}
            onChange={(e) => setVehicleNo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && findVehicle()}
            placeholder="Plate No / Asset No"
          />
          <button className="btnPrimary" onClick={findVehicle}>
            {vehicleLoading ? <span className="spinner" /> : 'Search'}
          </button>
        </div>

        {vehicleMessage && <div className="errorMessage">⚠ {vehicleMessage}</div>}

        {vehicle && (
          <div className="successBox fadeIn">
            <div className="verified"><span className="checkBadge">✓</span> Vehicle Found</div>
            <div className="vehicleMain">
              <PlateChip plate={vehicle.plate_no} />
              <span>{vehicle.equipment_description || '-'}</span>
            </div>
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
          <div>
            <h2>Workshop Complaint</h2>
            <p>Add one or more vehicle problems</p>
          </div>
        </div>

        {complaints.map((complaint, index) => (
          <div className="complaintItem" key={index}>
            <div className="complaintHeader">
              <span className="complaintTag">Complaint {index + 1}</span>
              {complaints.length > 1 && (
                <button className="deleteComplaint" onClick={() => removeComplaint(index)}>✕</button>
              )}
            </div>
            <textarea
              value={complaint}
              onChange={(e) => updateComplaint(index, e.target.value)}
              placeholder="Type your problem here..."
              rows="3"
            />
          </div>
        ))}

        <div className="dateField">
          <label className="fieldLabel" htmlFor="complaintDate">Complaint Date</label>
          <input
            id="complaintDate"
            type="date"
            value={complaintDate}
            max={maxComplaintDate}
            onChange={(e) => setComplaintDate(e.target.value)}
          />
        </div>

        <button className="addComplaintButton" onClick={addComplaint}>＋ Add Another Complaint</button>
        <button className="submitButton" onClick={submitComplaints} disabled={saving}>
          {saving ? <span className="spinner light" /> : 'SUBMIT COMPLAINT'}
        </button>

        {saveMessage && <div className="saveMessage fadeIn">{saveMessage}</div>}
      </section>
    </>
  );
}

/* =====================================================
   ADMIN SCREEN
===================================================== */
function AdminScreen({
  adminSearch, setAdminSearch, loadAdminComplaints, adminLoading, adminMessage,
  pending, completed, total, averageRepairDays,
  completedDates, handleCompletedDate, getToday, completeComplaint, onOpenReport,
}) {
  return (
    <>
      <section className="adminDashboard">
        <div className="dashboardHeader">
          <div><h2>SPIC DRIVE</h2><p>Complaint Overview</p></div>
          <div className="dashboardIcon">📊</div>
        </div>

        <div className="dashboardGrid">
          <div className="dashboardCard"><div className="dashboardCardIcon">🔴</div><div><span>Pending</span><strong>{pending.length}</strong></div></div>
          <div className="dashboardCard"><div className="dashboardCardIcon">🟢</div><div><span>Completed</span><strong>{completed.length}</strong></div></div>
          <div className="dashboardCard"><div className="dashboardCardIcon">📋</div><div><span>Total</span><strong>{total}</strong></div></div>
          <div className="dashboardCard"><div className="dashboardCardIcon">⏱️</div><div><span>Avg. Repair</span><strong>{averageRepairDays}d</strong></div></div>
        </div>

        <button className="dashboardReportButton" onClick={onOpenReport}>📄 Open Full Report</button>
      </section>

      <section className="card">
        <div className="sectionTitle">
          <span className="iconCircle iconBlue">👨‍💼</span>
          <div><h2>Complaint Management</h2><p>Pending &amp; completed complaints</p></div>
        </div>

        <div className="searchRow">
          <input
            type="text"
            value={adminSearch}
            onChange={(e) => setAdminSearch(e.target.value)}
            placeholder="Filter by Plate No / Asset No"
            autoComplete="off"
          />
          <button className="btnPrimary" onClick={loadAdminComplaints}>
            {adminLoading ? <span className="spinner" /> : 'Refresh'}
          </button>
        </div>

        {adminMessage && <div className="saveMessage fadeIn">{adminMessage}</div>}
      </section>

      <section className="card">
        <div className="adminSectionTitle"><span>🔴 Pending</span><span className="countBadge pendingCount">{pending.length}</span></div>

        {adminLoading && <p className="loadingText">Loading complaints...</p>}
        {!adminLoading && pending.length === 0 && <div className="emptyState">No pending complaints 🎉</div>}

        {pending.map((complaint) => (
          <div className="adminComplaint" key={complaint.id}>
            <div className="adminComplaintTop">
              <strong>{complaint.complaint_text}</strong>
              <span className="badge pendingBadge">Pending</span>
            </div>

            <div className="adminInfoGrid">
              <div className="adminInfo"><span>Vehicle</span><PlateChip plate={complaint.vehicles?.plate_no} /></div>
              <div className="adminInfo"><span>Driver</span><strong>{complaint.employees?.name || '-'}</strong></div>
              <div className="adminInfo"><span>Complaint Date</span><strong>{complaint.complaint_date}</strong></div>
            </div>

            <div className="daysBox">⏳ Pending for <strong>{calculateDays(complaint)} Days</strong></div>

            <div className="completeRow">
              <input
                type="date"
                value={completedDates[complaint.id] || getToday()}
                onChange={(e) => handleCompletedDate(complaint.id, e.target.value)}
              />
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
            <div className="adminComplaintTop">
              <strong>{complaint.complaint_text}</strong>
              <span className="badge completedBadge">Completed</span>
            </div>
            <div className="adminInfoGrid">
              <div className="adminInfo"><span>Vehicle</span><PlateChip plate={complaint.vehicles?.plate_no} /></div>
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
   ADMIN REPORT SCREEN
===================================================== */
function ReportScreen({ allComplaints, onBack }) {
  const [filter, setFilter] = useState('all'); // all | pending | completed
  const [search, setSearch] = useState('');

  const searchValue = search.trim().toLowerCase();
  let rows = allComplaints;
  if (filter === 'pending') rows = rows.filter((c) => c.status === 'Pending');
  if (filter === 'completed') rows = rows.filter((c) => c.status === 'Completed');
  if (searchValue) {
    rows = rows.filter((c) => {
      const plate = c.vehicles?.plate_no?.toString().toLowerCase() || '';
      const asset = c.vehicles?.asset_no?.toString().toLowerCase() || '';
      const driver = c.employees?.name?.toString().toLowerCase() || '';
      return plate.includes(searchValue) || asset.includes(searchValue) || driver.includes(searchValue);
    });
  }

  const pendingCount = allComplaints.filter((c) => c.status === 'Pending').length;
  const completedCount = allComplaints.filter((c) => c.status === 'Completed').length;
  const durations = allComplaints.filter((c) => c.status === 'Completed').map(calculateDays);
  const avgDays = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

  function exportCsv() {
    const header = ['Plate No', 'Asset No', 'Driver', 'Complaint', 'Complaint Date', 'Status', 'Completed Date', 'Days'];
    const lines = rows.map((c) => [
      c.vehicles?.plate_no || '', c.vehicles?.asset_no || '', c.employees?.name || '',
      `"${(c.complaint_text || '').replace(/"/g, '""')}"`, c.complaint_date || '',
      c.status || '', c.completed_date || '', calculateDays(c),
    ].join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `spicdrive-report-${getTodayString()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <section className="adminDashboard" id="reportPrintArea">
        <div className="reportTopBar noPrint">
          <button className="reportBackButton" onClick={onBack}>← Back to Dashboard</button>
        </div>

        <div className="dashboardHeader" style={{ marginTop: 14 }}>
          <div><h2>Workshop Report</h2><p>Generated {getTodayString()}</p></div>
          <div className="dashboardIcon">📄</div>
        </div>

        <div className="reportFilterRow noPrint">
          <button className={filter === 'all' ? 'reportFilterChip activeFilter' : 'reportFilterChip'} onClick={() => setFilter('all')}>All ({allComplaints.length})</button>
          <button className={filter === 'pending' ? 'reportFilterChip activeFilter' : 'reportFilterChip'} onClick={() => setFilter('pending')}>Pending ({pendingCount})</button>
          <button className={filter === 'completed' ? 'reportFilterChip activeFilter' : 'reportFilterChip'} onClick={() => setFilter('completed')}>Completed ({completedCount})</button>
        </div>

        <div className="reportStatsGrid">
          <div className="reportStatCard"><span>Pending</span><strong>{pendingCount}</strong></div>
          <div className="reportStatCard"><span>Completed</span><strong>{completedCount}</strong></div>
          <div className="reportStatCard"><span>Total</span><strong>{allComplaints.length}</strong></div>
          <div className="reportStatCard"><span>Avg. Repair</span><strong>{avgDays}d</strong></div>
        </div>
      </section>

      <section className="card">
        <div className="reportSearchRow noPrint">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Plate No, Asset No or Driver"
          />
        </div>

        <div className="reportActionsRow noPrint">
          <button className="exportCsvButton" onClick={exportCsv}>⬇ Export CSV</button>
          <button className="printReportButton" onClick={() => window.print()}>🖨 Print / PDF</button>
        </div>

        <div className="reportTableWrapper">
          <table className="reportTable">
            <thead>
              <tr>
                <th>Plate No</th><th>Asset No</th><th>Driver</th><th>Complaint</th>
                <th>Complaint Date</th><th>Status</th><th>Completed Date</th><th>Days</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><PlateChip plate={c.vehicles?.plate_no} /></td>
                  <td>{c.vehicles?.asset_no || '-'}</td>
                  <td>{c.employees?.name || '-'}</td>
                  <td className="reportComplaintCell">{c.complaint_text}</td>
                  <td>{c.complaint_date}</td>
                  <td>{c.status}</td>
                  <td>{c.completed_date || '-'}</td>
                  <td>{calculateDays(c)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--steel-500)', padding: '20px' }}>No records match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/* =====================================================
   MAIN APP
===================================================== */
function App() {
  // AUTH STATE
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null); // 'admin' | 'driver'
  const [authLoading, setAuthLoading] = useState(true);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [mode, setMode] = useState('driver'); // 'driver' | 'admin' | 'report'

  // DRIVER STATE
  const [gsNo, setGsNo] = useState('');
  const [employee, setEmployee] = useState(null);
  const [employeeMessage, setEmployeeMessage] = useState('');
  const [employeeLoading, setEmployeeLoading] = useState(false);

  const [vehicleNo, setVehicleNo] = useState('');
  const [vehicle, setVehicle] = useState(null);
  const [vehicleMessage, setVehicleMessage] = useState('');
  const [vehicleLoading, setVehicleLoading] = useState(false);

  const [complaints, setComplaints] = useState(['']);
  const [complaintDate, setComplaintDate] = useState(() => getTodayString());
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // ADMIN STATE
  const [adminSearch, setAdminSearch] = useState('');
  const [adminComplaints, setAdminComplaints] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminMessage, setAdminMessage] = useState('');
  const [completedDates, setCompletedDates] = useState({});

  /* ---------------- AUTH ---------------- */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadRole(data.session.user.id);
      else setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) loadRole(newSession.user.id);
      else { setRole(null); setAuthLoading(false); }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadRole(userId) {
    const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
    setRole(data?.role || 'driver');
    setAuthLoading(false);
  }

  async function handleLogin() {
    setLoginError('');
    if (!loginUsername.trim() || !loginPassword) {
      setLoginError('Enter your username and password.');
      return;
    }
    setLoginBusy(true);

    // Usernames map to a login email via the profiles table so staff never
    // need to remember or type an email address.
    const { data: profile, error: lookupError } = await supabase
      .from('profiles')
      .select('login_email')
      .eq('username', loginUsername.trim())
      .maybeSingle();

    if (lookupError || !profile) {
      setLoginBusy(false);
      setLoginError('Invalid username or password.');
      return;
    }

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: profile.login_email,
      password: loginPassword,
    });

    setLoginBusy(false);

    if (authError) {
      setLoginError('Invalid username or password.');
      return;
    }

    setLoginPassword('');
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setMode('driver');
    setEmployee(null);
    setVehicle(null);
  }

  /* ---------------- DRIVER FUNCTIONS ---------------- */
  async function findEmployee() {
    if (!gsNo.trim()) { setEmployee(null); setEmployeeMessage('Please enter GS No'); return; }
    setEmployeeLoading(true); setEmployeeMessage('');
    const { data, error } = await supabase.from('employees').select('*').eq('gs_no', gsNo.trim()).maybeSingle();
    setEmployeeLoading(false);
    if (error) { setEmployee(null); setEmployeeMessage(error.message); return; }
    if (!data) { setEmployee(null); setEmployeeMessage('Employee not found'); return; }
    setEmployee(data);
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
  function updateComplaint(index, value) { const u = [...complaints]; u[index] = value; setComplaints(u); }
  function removeComplaint(index) { if (complaints.length === 1) return; setComplaints(complaints.filter((_, i) => i !== index)); }

  async function submitComplaints() {
    setSaveMessage('');
    if (!employee) { setSaveMessage('Please search and select an employee first.'); return; }
    if (!vehicle) { setSaveMessage('Please search and select a vehicle first.'); return; }
    if (!complaintDate) { setSaveMessage('Please select a complaint date.'); return; }

    const validComplaints = complaints.map((t) => t.trim()).filter((t) => t !== '');
    if (validComplaints.length === 0) { setSaveMessage('Please enter at least one complaint.'); return; }

    setSaving(true);
    const records = validComplaints.map((text) => ({
      employee_id: employee.id, vehicle_id: vehicle.id, complaint_text: text,
      complaint_date: complaintDate, status: 'Pending',
    }));
    const { error } = await supabase.from('complaint_records').insert(records);
    setSaving(false);

    if (error) { setSaveMessage('Save failed: ' + error.message); return; }
    setSaveMessage(`✓ ${validComplaints.length} complaint(s) submitted successfully.`);
    setComplaints(['']);
    setComplaintDate(getTodayString());
  }

  /* ---------------- ADMIN FUNCTIONS ---------------- */
  async function loadAdminComplaints() {
    setAdminMessage(''); setAdminLoading(true);
    const { data: complaintsData, error: complaintsError } = await supabase
      .from('complaint_records').select('*').order('complaint_date', { ascending: false });

    if (complaintsError) { setAdminLoading(false); setAdminComplaints([]); setAdminMessage('Load failed: ' + complaintsError.message); return; }

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

  async function completeComplaint(id) {
    const date = completedDates[id] || getTodayString();
    const { error } = await supabase.from('complaint_records').update({ status: 'Completed', completed_date: date }).eq('id', id);
    if (error) { setAdminMessage('Update failed: ' + error.message); return; }
    setAdminMessage('✓ Complaint completed successfully.');
    loadAdminComplaints();
  }

  function handleCompletedDate(id, date) { setCompletedDates({ ...completedDates, [id]: date }); }

  useEffect(() => {
    if (session && role === 'admin' && (mode === 'admin' || mode === 'report')) loadAdminComplaints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, session, role]);

  const pending = visibleComplaints.filter((c) => c.status === 'Pending');
  const completed = visibleComplaints.filter((c) => c.status === 'Completed');
  const total = visibleComplaints.length;
  const completedDurations = completed.map(calculateDays);
  const averageRepairDays = completedDurations.length
    ? Math.round(completedDurations.reduce((s, d) => s + d, 0) / completedDurations.length) : 0;

  /* ---------------- RENDER ---------------- */
  if (authLoading) {
    return <div className="loginWrap"><span className="spinner light" /></div>;
  }

  if (!session) {
    return (
      <LoginScreen
        username={loginUsername} setUsername={setLoginUsername}
        password={loginPassword} setPassword={setLoginPassword}
        onLogin={handleLogin} loading={loginBusy} error={loginError}
      />
    );
  }

  // Driver accounts never see the Admin/Report modes, no matter what mode was left in state.
  const effectiveMode = role === 'admin' ? mode : 'driver';

  return (
    <div className="app">
      <header className="header">
        <div className="brandRow">
          <div className="logoBadge"><img src={spicDriveLogo} alt="SPIC DRIVE logo" className="logoImg" /></div>
          <div>
            <div className="logo">SPIC DRIVE</div>
            <div className="headerSub">Vehicle Service System</div>
          </div>
        </div>
        <div className="headerRight">
          <span className="roleTag">{role === 'admin' ? 'Admin' : 'Driver'}</span>
          <button className="logoutButton" onClick={handleLogout}>Log out</button>
        </div>
      </header>

      {role === 'admin' && (
        <div className="modeSwitch">
          <button className={effectiveMode === 'driver' ? 'modeButton activeMode' : 'modeButton'} onClick={() => setMode('driver')}>👤 Driver</button>
          <button className={effectiveMode === 'admin' ? 'modeButton activeMode' : 'modeButton'} onClick={() => setMode('admin')}>👨‍💼 Admin</button>
        </div>
      )}

      <main className="container">
        {effectiveMode === 'driver' && (
          <DriverScreen
            gsNo={gsNo} setGsNo={setGsNo} employee={employee}
            employeeMessage={employeeMessage} employeeLoading={employeeLoading} findEmployee={findEmployee}
            vehicleNo={vehicleNo} setVehicleNo={setVehicleNo} vehicle={vehicle}
            vehicleMessage={vehicleMessage} vehicleLoading={vehicleLoading} findVehicle={findVehicle}
            complaintDate={complaintDate} setComplaintDate={setComplaintDate} maxComplaintDate={getTodayString()}
            complaints={complaints} updateComplaint={updateComplaint}
            addComplaint={addComplaint} removeComplaint={removeComplaint}
            submitComplaints={submitComplaints} saving={saving} saveMessage={saveMessage}
          />
        )}

        {effectiveMode === 'admin' && (
          <AdminScreen
            adminSearch={adminSearch} setAdminSearch={setAdminSearch}
            loadAdminComplaints={loadAdminComplaints} adminLoading={adminLoading} adminMessage={adminMessage}
            pending={pending} completed={completed} total={total} averageRepairDays={averageRepairDays}
            completedDates={completedDates} handleCompletedDate={handleCompletedDate}
            getToday={getTodayString} completeComplaint={completeComplaint}
            onOpenReport={() => setMode('report')}
          />
        )}

        {effectiveMode === 'report' && (
          <ReportScreen allComplaints={adminComplaints} onBack={() => setMode('admin')} />
        )}
      </main>

      <footer>SPIC DRIVE • Vehicle Management System</footer>
    </div>
  );
}

export default App;
