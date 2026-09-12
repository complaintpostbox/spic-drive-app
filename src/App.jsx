MANAGE USERS (admin-only)
   Item #10 (part): create drivers/admins from inside the app instead of
   the Supabase dashboard, and reset a user's password from here too.
===================================================== */
function AdminUserManager({ onBack, currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('driver');
  const [gsNo, setGsNo] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('driver');
  const [editGsNo, setEditGsNo] = useState('');
  const [editPassword, setEditPassword] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setMessage('');
    const { data, error } = await supabase.from('users').select('*').order('username', { ascending: true });
    if (error) { setMessage('Load failed: ' + error.message); setLoading(false); return; }
    setUsers(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addUser() {
    if (!username.trim() || !password.trim() || !name.trim()) { setMessage('Username, password, and name are all required.'); return; }
    if (role === 'driver' && !gsNo.trim()) { setMessage('GS No is required for driver accounts.'); return; }

    setSaving(true);
    const { error } = await supabase.from('users').insert({
      username: username.trim(), password: password.trim(), name: name.trim(),
      role, gs_no: role === 'driver' ? gsNo.trim() : null,
    });
    setSaving(false);
    if (error) { setMessage(error.message.includes('duplicate') ? 'That username already exists.' : 'Save failed: ' + error.message); return; }
    setUsername(''); setPassword(''); setName(''); setGsNo(''); setRole('driver');
    load();
  }

  function startEdit(u) {
    setEditingId(u.id); setEditName(u.name); setEditRole(u.role); setEditGsNo(u.gs_no || ''); setEditPassword('');
  }
  function cancelEdit() { setEditingId(null); }

  async function saveEdit(id) {
    const patch = { name: editName.trim(), role: editRole, gs_no: editRole === 'driver' ? editGsNo.trim() : null };
    if (editPassword.trim()) patch.password = editPassword.trim();
    const { error } = await supabase.from('users').update(patch).eq('id', id);
    if (error) { setMessage('Update failed: ' + error.message); return; }
    setEditingId(null);
    load();
  }

  async function deleteUser(u) {
    if (u.id === currentUser.id) { setMessage("You can't delete the account you're signed in with."); return; }
    const { error } = await supabase.from('users').delete().eq('id', u.id);
    if (error) { setMessage('Delete failed: ' + error.message); return; }
    load();
  }

  return (
    <>
      <div className="reportTopBar noPrint">
        <button className="reportBackButton" onClick={onBack}>← Back to Dashboard</button>
      </div>

      <section className="card">
        <div className="sectionTitle">
          <span className="iconCircle iconIndigo">👥</span>
          <div><h2>Manage Users</h2><p>Create admin or driver accounts without touching Supabase</p></div>
        </div>

        <div className="dateField">
          <label className="fieldLabel">Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. driver12" />
        </div>
        <div className="dateField">
          <label className="fieldLabel">Temporary Password</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="They should change this after first login" />
        </div>
        <div className="dateField">
          <label className="fieldLabel">Full Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="dateField">
          <label className="fieldLabel">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="driver">Driver</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        {role === 'driver' && (
          <div className="dateField">
            <label className="fieldLabel">GS No (must match an employees.gs_no)</label>
            <input value={gsNo} onChange={(e) => setGsNo(e.target.value)} placeholder="e.g. GS1023" />
          </div>
        )}
        <button className="submitButton" onClick={addUser} disabled={saving}>
          {saving ? <span className="spinner light" /> : '＋ Add User'}
        </button>
        {message && <div className="errorMessage">⚠ {message}</div>}
      </section>

      <section className="card">
        <div className="adminSectionTitle"><span>👥 Users</span><span className="countBadge pendingCount">{users.length}</span></div>
        {loading && <p className="loadingText">Loading...</p>}
        {!loading && users.map((u) => (
          <div className="adminComplaint" key={u.id}>
            {editingId === u.id ? (
              <>
                <div className="dateField"><label className="fieldLabel">Full Name</label><input value={editName} onChange={(e) => setEditName(e.target.value)} /></div>
                <div className="dateField">
                  <label className="fieldLabel">Role</label>
                  <select value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                    <option value="driver">Driver</option><option value="admin">Admin</option>
                  </select>
                </div>
                {editRole === 'driver' && (
                  <div className="dateField"><label className="fieldLabel">GS No</label><input value={editGsNo} onChange={(e) => setEditGsNo(e.target.value)} /></div>
                )}
                <div className="dateField"><label className="fieldLabel">Reset Password (leave blank to keep current)</label><input value={editPassword} onChange={(e) => setEditPassword(e.target.value)} /></div>
                <div className="completeRow">
                  <button className="completeButton" onClick={() => saveEdit(u.id)}>✓ Save</button>
                  <button className="deleteComplaint locationCancelBtn" onClick={cancelEdit}>✕ Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div className="adminComplaintTop"><strong>{u.name}</strong><span className={u.role === 'admin' ? 'badge completedBadge' : 'badge pendingBadge'}>{u.role.toUpperCase()}</span></div>
                <div className="adminInfoGrid">
                  <div className="adminInfo"><span>Username</span><strong>{u.username}</strong></div>
                  <div className="adminInfo"><span>GS No</span><strong>{u.gs_no || '-'}</strong></div>
                </div>
                <div className="completeRow">
                  <button className="btnPrimary" onClick={() => startEdit(u)}>Edit</button>
                  <button className="deleteComplaint locationCancelBtn" onClick={() => deleteUser(u)}>Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
      </section>
    </>
  );
}

/* =====================================================
   ADMIN DASHBOARD
===================================================== */
function AdminDashboard({
  complaints, adminSearch, setAdminSearch, refreshing, message,
  completedDates, handleCompletedDate, completeComplaint, onEditComplaint,
  onOpenReport, onOpenLocations, onOpenUsers, onRefresh,
}) {
  const searchValue = adminSearch.trim().toLowerCase();

  const visible = useMemo(() => {
    if (!searchValue) return complaints;
    return complaints.filter((item) => {
      const plate = item.vehicles?.plate_no?.toString().toLowerCase() || '';
      const asset = item.vehicles?.asset_no?.toString().toLowerCase() || '';
      return plate.includes(searchValue) || asset.includes(searchValue);
    });
  }, [complaints, searchValue]);

  const pending = useMemo(() => visible.filter((c) => c.status === 'Pending'), [visible]);
  const completed = useMemo(() => visible.filter((c) => c.status === 'Completed'), [visible]);
  const total = visible.length;
  const averageRepairDays = useMemo(() => {
    const durations = completed.map((c) => daysBetween(c.complaint_date, c.completed_date));
    if (!durations.length) return 0;
    return Math.round(durations.reduce((s, d) => s + d, 0) / durations.length);
  }, [completed]);

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
        <div className="dashboardCtaRow">
          <button className="reportCtaButton" onClick={onOpenReport}>📋 Open Full Report</button>
          <button className="reportCtaButton" onClick={onOpenLocations}>📍 Manage Locations</button>
          <button className="reportCtaButton" onClick={onOpenUsers}>👥 Manage Users</button>
        </div>
      </section>

      <section className="card">
        <div className="sectionTitle">
          <span className="iconCircle iconIndigo">👨‍💼</span>
          <div><h2>Complaint Management</h2><p>Pending &amp; completed complaints</p></div>
        </div>
        <div className="searchRow">
          <input type="text" value={adminSearch} onChange={(e) => setAdminSearch(e.target.value)} placeholder="Filter by Plate No / Asset No" autoComplete="off" />
          <button className="btnPrimary" onClick={onRefresh}>{refreshing ? <span className="spinner" /> : 'Refresh'}</button>
        </div>
        {message && <div className="saveMessage fadeIn">{message}</div>}
      </section>

      <section className="card">
        <div className="adminSectionTitle"><span>🔴 Pending</span><span className="countBadge pendingCount">{pending.length}</span></div>
        {refreshing && <p className="loadingText">Loading complaints...</p>}
        {!refreshing && (
          <AdminComplaintsTable
            variant="pending" rows={pending}
            completedDates={completedDates} onCompletedDateChange={handleCompletedDate}
            onMarkComplete={completeComplaint} onEdit={onEditComplaint}
          />
        )}
      </section>

      <section className="card">
        <div className="adminSectionTitle"><span>🟢 Completed</span><span className="countBadge completedCount">{completed.length}</span></div>
        <AdminComplaintsTable variant="completed" rows={completed} onEdit={onEditComplaint} />
      </section>
    </>
  );
}

/* =====================================================
   MAIN APP
===================================================== */
function App() {
  // Item #10: currentUser is now persisted to localStorage on login and
  // rehydrated on mount, so the app stays "logged in" across tab reloads,
  // OS-triggered backgrounding (e.g. taking a phone call), etc. — the
  // *only* thing that clears it is explicitly clicking Sign Out. There
  // was no session/token expiry logic before this; the app was simply
  // losing all state on any reload because it was never persisted.
  const [currentUser, setCurrentUser] = useState(loadStoredUser);
  const [mode, setMode] = useState('admin');
  const [showPasswordPanel, setShowPasswordPanel] = useState(false);

  const [complaints, setComplaints] = useState([]);
  const [complaintsLoading, setComplaintsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [adminSearch, setAdminSearch] = useState('');
  const [completedDates, setCompletedDates] = useState({});
  const [adminView, setAdminView] = useState('dashboard'); // 'dashboard' | 'report' | 'locations' | 'users'

  function login(user) { storeUser(user); setCurrentUser(user); }
  function signOut() { storeUser(null); setCurrentUser(null); setAdminView('dashboard'); setShowPasswordPanel(false); }
  function onCredentialsUpdated(updatedUser) {
    const merged = { ...currentUser, ...updatedUser };
    storeUser(merged);
    setCurrentUser(merged);
  }

  const fetchComplaints = useCallback(async () => {
    setMessage('');
    setComplaintsLoading(true);

    const { data: complaintsData, error: complaintsError } = await supabase
      .from('complaint_records').select('*').order('complaint_date', { ascending: false });

    if (complaintsError) {
      setComplaintsLoading(false); setComplaints([]);
      setMessage('Load failed: ' + complaintsError.message);
      return;
    }

    const vehicleIds = [...new Set((complaintsData || []).map((i) => i.vehicle_id).filter(Boolean))];
    const employeeIds = [...new Set((complaintsData || []).map((i) => i.employee_id).filter(Boolean))];
    let vehiclesMap = new Map(), employeesMap = new Map();

    if (vehicleIds.length > 0) {
      const { data, error } = await supabase.from('vehicles').select('*').in('id', vehicleIds);
      if (error) { setComplaintsLoading(false); setMessage('Vehicle load failed: ' + error.message); return; }
      vehiclesMap = toMap(data);
    }
    if (employeeIds.length > 0) {
      const { data, error } = await supabase.from('employees').select('*').in('id', employeeIds);
      if (error) { setComplaintsLoading(false); setMessage('Employee load failed: ' + error.message); return; }
      employeesMap = toMap(data);
    }

    const finalData = (complaintsData || []).map((c) => ({
      ...c,
      vehicles: vehiclesMap.get(c.vehicle_id) || null,
      employees: employeesMap.get(c.employee_id) || null,
    }));
    setComplaints(finalData);
    setComplaintsLoading(false);
  }, []);

  useEffect(() => {
    if (currentUser) fetchComplaints();
  }, [currentUser, fetchComplaints]);

  const completeComplaint = useCallback(async (id) => {
    const date = completedDates[id] || getTodayString();
    const { error } = await supabase.from('complaint_records').update({ status: 'Completed', completed_date: date }).eq('id', id);
    if (error) { setMessage('Update failed: ' + error.message); return; }
    setMessage('✓ Complaint completed successfully.');
    fetchComplaints();
  }, [completedDates, fetchComplaints]);

  // Item #9: generic admin edit — can change the complaint text, vehicle
  // location, remarks, dates, and even flip status back to Pending to
  // correct a mistaken "Mark Completed".
  const editComplaint = useCallback(async (id, patch) => {
    const { error } = await supabase.from('complaint_records').update(patch).eq('id', id);
    if (error) { setMessage('Edit failed: ' + error.message); return; }
    setMessage('✓ Complaint updated.');
    fetchComplaints();
  }, [fetchComplaints]);

  function handleCompletedDate(id, date) { setCompletedDates((prev) => ({ ...prev, [id]: date })); }

  if (!currentUser) return <LoginScreen onLogin={login} />;

  return (
    <div className="app">
      <header className="header">
        <div className="brandRow">
          <div className="logoBadge"><img src={LOGO_URL} alt="SPIC DRIVE logo" className="logoImg" /></div>
          <div><div className="logo">SPIC DRIVE</div><div className="headerSub">Vehicle Service System</div></div>
        </div>
        {/* Item #1: text label instead of a unicode glyph (⏻ has no glyph
            on some mobile fonts, rendering blank/"invisible"), flex-shrink:0
            so it can never get squeezed by the brand text, and .header now
            wraps instead of clipping if space is ever this tight. */}
        <button className="logoutButton" onClick={signOut} title="Sign out">⏻ Sign Out</button>
      </header>

      <div className="roleBar">
        <span className="roleChip">🛡 {currentUser.name} · {currentUser.role === 'admin' ? 'Administrator' : 'Driver'}</span>
        <button className="passwordToggleBtn" onClick={() => setShowPasswordPanel((v) => !v)}>🔑 Password</button>
      </div>

      {showPasswordPanel && (
        <div className="container" style={{ paddingTop: 14, paddingBottom: 0 }}>
          <ChangePasswordPanel currentUser={currentUser} onClose={() => setShowPasswordPanel(false)} onUpdated={onCredentialsUpdated} />
        </div>
      )}

      {currentUser.role === 'admin' && (
        <div className="modeSwitch">
          <button className={mode === 'driver' ? 'modeButton activeMode' : 'modeButton'} onClick={() => setMode('driver')}>👤 Driver</button>
          <button className={mode === 'admin' ? 'modeButton activeMode' : 'modeButton'} onClick={() => setMode('admin')}>👨‍💼 Admin</button>
        </div>
      )}

      <main className="container">
        {currentUser.role === 'driver' || mode === 'driver' ? (
          <DriverExperience
            currentUser={currentUser} complaints={complaints} complaintsLoading={complaintsLoading}
            complaintsMessage={message} onRefresh={fetchComplaints}
          />
        ) : adminView === 'report' ? (
          <ReportView complaints={complaints} loading={complaintsLoading} message={message} showBack onBack={() => setAdminView('dashboard')} />
        ) : adminView === 'locations' ? (
          <LocationManager onBack={() => setAdminView('dashboard')} />
        ) : adminView === 'users' ? (
          <AdminUserManager onBack={() => setAdminView('dashboard')} currentUser={currentUser} />
        ) : (
          <AdminDashboard
            complaints={complaints} adminSearch={adminSearch} setAdminSearch={setAdminSearch}
            refreshing={complaintsLoading} message={message}
            completedDates={completedDates} handleCompletedDate={handleCompletedDate}
            completeComplaint={completeComplaint} onEditComplaint={editComplaint}
            onOpenReport={() => setAdminView('report')} onOpenLocations={() => setAdminView('locations')}
            onOpenUsers={() => setAdminView('users')} onRefresh={fetchComplaints}
          />
        )}
      </main>

      <footer>SPIC DRIVE • Enterprise Workshop Management</footer>
    </div>
  );
}

export default App;
