import { useCallback, useEffect, useMemo, useState } from 'react';
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
// Display helper only — storage / <input type="date"> stays ISO (YYYY-MM-DD).
function formatDMY(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${d}-${m}-${y}`;
}
// Build fast id -> record lookups once per fetch instead of repeated
// Array#find calls (O(n) each) scattered through render.
function toMap(rows) {
  const m = new Map();
  (rows || []).forEach((r) => m.set(r.id, r));
  return m;
}

// Locations are fetched independently of the complaints data (only when the
// Route Planner or Manage Locations screens actually mount) so they never
// add weight to the driver/admin complaint flows.
async function fetchLocationsData() {
  const { data, error } = await supabase.from('locations').select('*').order('name', { ascending: true });
  return { data: data || [], error };
}

// Builds a Google Maps multi-stop directions URL. Distance and travel time
// are computed by Google Maps itself once the link opens — no separate
// Distance Matrix call needed.
//
// formatMapPoint recognizes "lat,lng" (any spacing around the comma) and
// passes coordinate pairs through cleanly; otherwise it treats the value as
// a free-text place name/address (e.g. `KNPC - 54`, `MHC "F" Camp`),
// collapsing stray whitespace so admin-entered names stay well-formed as
// the list of stations grows.
function formatMapPoint(location) {
  const source = (location.address && location.address.trim()) || (location.name && location.name.trim()) || '';
  const raw = source.replace(/\s+/g, ' ').trim();
  const coordMatch = raw.match(/^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  return coordMatch ? `${coordMatch[1]},${coordMatch[2]}` : raw;
}

// Each point is percent-encoded on its own with encodeURIComponent (so
// commas in coordinates, quotes/hyphens/ampersands in names, etc. are all
// handled correctly) — but unlike URLSearchParams, the "|" that separates
// waypoints is left as a literal character rather than re-encoded to
// "%7C". Google Maps' web client tolerates either, but its mobile-app
// deep-link handler expects a raw "|" and doesn't reliably split on
// "%7C", which is what was silently breaking multi-stop links on phones.
function buildGoogleMapsUrl(origin, destination, waypoints) {
  const originStr = encodeURIComponent(formatMapPoint(origin));
  const destinationStr = encodeURIComponent(formatMapPoint(destination));
  const stops = waypoints.map(formatMapPoint).filter(Boolean).map(encodeURIComponent);

  let url = `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${destinationStr}&travelmode=driving`;
  if (stops.length) url += `&waypoints=${stops.join('|')}`;
  return url;
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
   SUBMIT COMPLAINT PANEL
   GS No lookup -> vehicle lookup -> multi-complaint submit.
   Used both for real drivers and for an admin previewing the
   driver flow. No "My Complaints" list here anymore — that's
   what the Report tab is for (avoids a duplicate query).
===================================================== */
function SubmitComplaintPanel({ currentUser, onSubmitted }) {
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

  const findEmployee = useCallback(async () => {
    if (!gsNo.trim()) { setEmployee(null); setEmployeeMessage('Please enter GS No'); return; }
    setEmployeeLoading(true); setEmployeeMessage('');
    const { data, error } = await supabase.from('employees').select('*').eq('gs_no', gsNo.trim()).maybeSingle();
    setEmployeeLoading(false);
    if (error) { setEmployee(null); setEmployeeMessage(error.message); return; }
    if (!data) { setEmployee(null); setEmployeeMessage('Employee not found'); return; }
    setEmployee(data);
  }, [gsNo]);

  useEffect(() => {
    if (currentUser.role === 'driver' && currentUser.gs_no) findEmployee();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const findVehicle = useCallback(async () => {
    if (!vehicleNo.trim()) { setVehicle(null); setVehicleMessage('Please enter Plate No or Asset No'); return; }
    setVehicleLoading(true); setVehicleMessage('');
    const value = vehicleNo.trim();
    const { data, error } = await supabase.from('vehicles').select('*').or(`plate_no.eq.${value},asset_no.eq.${value}`).limit(1).maybeSingle();
    setVehicleLoading(false);
    if (error) { setVehicle(null); setVehicleMessage(error.message); return; }
    if (!data) { setVehicle(null); setVehicleMessage('Vehicle not found'); return; }
    setVehicle(data);
  }, [vehicleNo]);

  function addComplaint() { setComplaints((c) => [...c, '']); }
  function updateComplaint(i, v) { setComplaints((c) => c.map((t, idx) => (idx === i ? v : t))); }
  function removeComplaint(i) { setComplaints((c) => (c.length === 1 ? c : c.filter((_, idx) => idx !== i))); }

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
    onSubmitted?.();
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
              <div className="infoRow"><span>GS No</span><strong>{employee.gs_no || '-'}</strong></div>
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
    </>
  );
}

/* =====================================================
   REPORT VIEW (read-only)
   Letterhead + filter tabs + plate/asset search + CSV export
   + print. Used by drivers (always) and by admins (via "Open
   Full Report"). Never shows any admin action controls.
===================================================== */
const FILTER_LABELS = { all: 'All Complaints', pending: 'Pending Complaints', completed: 'Completed Complaints' };

function ReportView({ complaints, loading, message, onBack, showBack }) {
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
    const header = ['S.No', 'Vehicle', 'Asset No', 'Driver', 'GS No', 'Complaint', 'Complaint Date', 'Completed Date', 'Status', 'Days'];
    const lines = rows.map((c, i) => [
      i + 1, c.vehicles?.plate_no || '-', c.vehicles?.asset_no || '-', c.employees?.name || '-',
      c.employees?.gs_no || '-',
      `"${(c.complaint_text || '').replace(/"/g, '""')}"`, formatDMY(c.complaint_date) || '-', formatDMY(c.completed_date) || '-',
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
      {showBack && (
        <div className="reportTopBar noPrint">
          <button className="reportBackButton" onClick={onBack}>← Back to Dashboard</button>
        </div>
      )}

      <section className="reportLetterhead">
        <img src={spicDriveLogo} alt="SPIC DRIVE" className="reportLetterheadLogo" />
        <div className="reportLetterheadText">
          <h2>SPIC DRIVE</h2>
          <p>Workshop Complaint Report</p>
        </div>
        <div className="reportLetterheadMeta">
          <span>{FILTER_LABELS[filter]}</span>
          <span>Generated {formatDMY(getTodayString())}</span>
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
          <span className="reportTableCount">{loading ? 'Loading…' : `${rows.length} record${rows.length === 1 ? '' : 's'}`}</span>
        </div>
        {message && <div className="errorMessage">⚠ {message}</div>}
        <div className="reportTableWrapper">
          <table className="reportTable">
            <thead>
              <tr><th>#</th><th>Vehicle</th><th>Driver (GS No)</th><th className="reportComplaintCell">Complaint</th><th>Complaint Date</th><th>Completed</th><th>Status</th><th>Days</th></tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={c.id}>
                  <td>{i + 1}</td>
                  <td>{c.vehicles?.plate_no || '-'}</td>
                  <td>{c.employees?.name ? `${c.employees.name}${c.employees.gs_no ? ` (${c.employees.gs_no})` : ''}` : '-'}</td>
                  <td className="reportComplaintCell">{c.complaint_text}</td>
                  <td>{formatDMY(c.complaint_date) || '-'}</td>
                  <td>{formatDMY(c.completed_date) || '—'}</td>
                  <td><span className={c.status === 'Pending' ? 'badge pendingBadge' : 'badge completedBadge'}>{c.status.toUpperCase()}</span></td>
                  <td>{daysBetween(c.complaint_date, c.completed_date)}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
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
   ROUTE PLANNER (driver-only tab)
   Start point -> N dynamic stops -> end point, then hands the
   ordered waypoints straight to Google Maps, which computes the
   route, total distance, and travel time itself. Locations are
   fetched only when this tab mounts, so it never touches the
   complaints data path or slows the other tabs.

   FIXES APPLIED:
   1. ID lookup bug — <select> values from e.target.value are
      ALWAYS strings, but Supabase's `id` column comes back as a
      number. locationsById is now keyed by String(l.id) so it
      matches the string startId/endId/stopIds coming out of the
      dropdowns. (Using the shared toMap() helper — numeric keys —
      silently failed every .get() call with a string argument.)
   2. Desktop layout — Starting Point / End Point sit in a
      2-column grid (.routeEndpoints) on wider screens instead of
      always stacking full-width.
   3. Touch target — the per-stop remove button uses
      .removeStopButton (40px, vs. the old 26px .deleteComplaint)
      so it's comfortably tappable on a phone.
===================================================== */
function RoutePlanner() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const [startId, setStartId] = useState('');
  const [endId, setEndId] = useState('');
  const [stopIds, setStopIds] = useState([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await fetchLocationsData();
      if (!active) return;
      if (error) { setMessage('Could not load locations: ' + error.message); setLoading(false); return; }
      setLocations(data);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  // Keyed by String(id) to match the string values <select> always
  // produces via e.target.value — this is the fix for the lookup mismatch.
  const locationsById = useMemo(() => {
    const m = new Map();
    locations.forEach((l) => m.set(String(l.id), l));
    return m;
  }, [locations]);

  function addStop() { setStopIds((s) => [...s, '']); }
  function updateStop(i, v) { setStopIds((s) => s.map((x, idx) => (idx === i ? v : x))); }
  function removeStop(i) { setStopIds((s) => s.filter((_, idx) => idx !== i)); }

  const canOpen = Boolean(startId && endId);

  function openInGoogleMaps() {
    const origin = locationsById.get(startId);
    const destination = locationsById.get(endId);
    if (!origin || !destination) {
      setMessage('Could not match the selected start/end location — please re-select them and try again.');
      return;
    }
    if (!formatMapPoint(origin) || !formatMapPoint(destination)) {
      setMessage('The selected start or end location has no name or address saved — edit it in Manage Locations first.');
      return;
    }
    setMessage('');
    const waypoints = stopIds.map((id) => locationsById.get(id)).filter(Boolean);
    window.open(buildGoogleMapsUrl(origin, destination, waypoints), '_blank', 'noopener,noreferrer');
  }

  return (
    <section className="card">
      <div className="sectionTitle">
        <span className="iconCircle iconIndigo">🗺️</span>
        <div><h2>Route Planner</h2><p>Build a multi-stop trip and open it in Google Maps</p></div>
      </div>

      {loading && <p className="loadingText">Loading locations...</p>}
      {message && <div className="errorMessage">⚠ {message}</div>}

      {!loading && locations.length === 0 && !message && (
        <div className="emptyState">No saved locations yet — ask an admin to add some in Manage Locations.</div>
      )}

      {!loading && locations.length > 0 && (
        <>
          <div className="routeEndpoints">
            <div className="dateField">
              <label className="fieldLabel">Starting Point</label>
              <select value={startId} onChange={(e) => setStartId(e.target.value)}>
                <option value="">Select starting location</option>
                {locations.map((l) => <option key={l.id} value={String(l.id)}>{l.name}</option>)}
              </select>
            </div>

            <div className="dateField">
              <label className="fieldLabel">End Point</label>
              <select value={endId} onChange={(e) => setEndId(e.target.value)}>
                <option value="">Select destination</option>
                {locations.map((l) => <option key={l.id} value={String(l.id)}>{l.name}</option>)}
              </select>
            </div>
          </div>

          {stopIds.map((id, i) => (
            <div className="dateField" key={i}>
              <label className="fieldLabel">Point {i + 1}</label>
              <div className="routeStopRow">
                <select value={id} onChange={(e) => updateStop(i, e.target.value)}>
                  <option value="">Select stop</option>
                  {locations.map((l) => <option key={l.id} value={String(l.id)}>{l.name}</option>)}
                </select>
                <button className="removeStopButton" onClick={() => removeStop(i)} aria-label={`Remove point ${i + 1}`}>✕</button>
              </div>
            </div>
          ))}

          <button className="addComplaintButton" onClick={addStop}>＋ Add Point</button>
          {stopIds.length > 8 && (
            <div className="errorMessage">⚠ Google Maps supports up to 9 stops — consider splitting long routes.</div>
          )}

          <button className="submitButton" onClick={openInGoogleMaps} disabled={!canOpen}>
            🗺 Open Route in Google Maps
          </button>
          <p className="loadingText">Distance &amp; travel time are calculated automatically by Google Maps once it opens.</p>
        </>
      )}
    </section>
  );
}

/* =====================================================
   DRIVER EXPERIENCE
   Three lightweight tabs: Submit Complaint / Complaint Status /
   Route Planner. Only the active tab's component is mounted, so
   each one's data loads independently and on demand. Used for
   real drivers, and for an admin previewing driver mode.
===================================================== */
function DriverExperience({ currentUser, complaints, complaintsLoading, complaintsMessage, onRefresh }) {
  const [tab, setTab] = useState('submit');

  return (
    <>
      <div className="modeSwitch driverTabs">
        <button className={tab === 'submit' ? 'modeButton activeMode' : 'modeButton'} onClick={() => setTab('submit')}>📝 Submit</button>
        <button className={tab === 'report' ? 'modeButton activeMode' : 'modeButton'} onClick={() => setTab('report')}>📋 Status</button>
        <button className={tab === 'route' ? 'modeButton activeMode' : 'modeButton'} onClick={() => setTab('route')}>🗺️ Route</button>
      </div>
      {tab === 'submit' && <SubmitComplaintPanel currentUser={currentUser} onSubmitted={onRefresh} />}
      {tab === 'report' && (
        <ReportView complaints={complaints} loading={complaintsLoading} message={complaintsMessage} showBack={false} />
      )}
      {tab === 'route' && <RoutePlanner />}
    </>
  );
}

/* =====================================================
   MANAGE LOCATIONS (admin-only)
   Simple CRUD over a `locations` table (name + address/lat,lng)
   that feeds the driver Route Planner's dropdowns.
===================================================== */
function LocationManager({ onBack }) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setMessage('');
    const { data, error } = await fetchLocationsData();
    if (error) { setMessage('Load failed: ' + error.message); setLoading(false); return; }
    setLocations(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addLocation() {
    if (!name.trim()) { setMessage('Enter a location name.'); return; }
    setSaving(true);
    const { error } = await supabase.from('locations').insert({ name: name.trim(), address: address.trim() || null });
    setSaving(false);
    if (error) { setMessage('Save failed: ' + error.message); return; }
    setName(''); setAddress('');
    load();
  }

  function startEdit(loc) { setEditingId(loc.id); setEditName(loc.name); setEditAddress(loc.address || ''); }
  function cancelEdit() { setEditingId(null); }

  async function saveEdit(id) {
    if (!editName.trim()) { setMessage('Name cannot be empty.'); return; }
    const { error } = await supabase.from('locations').update({ name: editName.trim(), address: editAddress.trim() || null }).eq('id', id);
    if (error) { setMessage('Update failed: ' + error.message); return; }
    setEditingId(null);
    load();
  }

  async function deleteLocation(id) {
    const { error } = await supabase.from('locations').delete().eq('id', id);
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
          <span className="iconCircle iconGold">📍</span>
          <div><h2>Manage Locations</h2><p>Stations &amp; project sites used by the Route Planner (40–50 typical)</p></div>
        </div>

        <div className="dateField">
          <label className="fieldLabel">Location Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. F Camp, Station 140" />
        </div>
        <div className="dateField">
          <label className="fieldLabel">Address / Coordinates (optional)</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Full address, or lat,lng — used for Google Maps" />
        </div>
        <button className="submitButton" onClick={addLocation} disabled={saving}>
          {saving ? <span className="spinner light" /> : '＋ Add Location'}
        </button>
        {message && <div className="errorMessage">⚠ {message}</div>}
      </section>

      <section className="card">
        <div className="adminSectionTitle"><span>📍 Locations</span><span className="countBadge pendingCount">{locations.length}</span></div>
        {loading && <p className="loadingText">Loading...</p>}
        {!loading && locations.length === 0 && <div className="emptyState">No locations added yet</div>}
        {locations.map((loc) => (
          <div className="adminComplaint" key={loc.id}>
            {editingId === loc.id ? (
              <>
                <div className="dateField">
                  <label className="fieldLabel">Name</label>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                </div>
                <div className="dateField">
                  <label className="fieldLabel">Address / Coordinates</label>
                  <input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="Address / lat,lng" />
                </div>
                <div className="completeRow">
                  <button className="completeButton" onClick={() => saveEdit(loc.id)}>✓ Save</button>
                  <button className="deleteComplaint locationCancelBtn" onClick={cancelEdit}>✕ Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div className="adminComplaintTop"><strong>{loc.name}</strong></div>
                <div className="adminInfoGrid">
                  <div className="adminInfo"><span>Address / Coordinates</span><strong>{loc.address || '-'}</strong></div>
                </div>
                <div className="completeRow">
                  <button className="btnPrimary" onClick={() => startEdit(loc)}>Edit</button>
                  <button className="deleteComplaint locationCancelBtn" onClick={() => deleteLocation(loc.id)}>Delete</button>
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
   ADMIN DASHBOARD (pending / completed + mark-complete)
===================================================== */
function AdminDashboard({
  complaints, adminSearch, setAdminSearch, refreshing, message,
  completedDates, handleCompletedDate, completeComplaint, onOpenReport, onOpenLocations, onRefresh,
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
        {!refreshing && pending.length === 0 && <div className="emptyState">No pending complaints 🎉</div>}
        {pending.map((complaint) => (
          <div className="adminComplaint" key={complaint.id}>
            <div className="adminComplaintTop"><strong>{complaint.complaint_text}</strong><span className="badge pendingBadge">PENDING</span></div>
            <div className="adminInfoGrid">
              <div className="adminInfo"><span>Vehicle</span><strong>{complaint.vehicles?.plate_no || '-'}</strong></div>
              <div className="adminInfo"><span>Driver</span><strong>{complaint.employees?.name || '-'}{complaint.employees?.gs_no ? ` (${complaint.employees.gs_no})` : ''}</strong></div>
              <div className="adminInfo"><span>Complaint Date</span><strong>{formatDMY(complaint.complaint_date)}</strong></div>
            </div>
            <div className="daysBox">⏳ Pending for <strong>{daysBetween(complaint.complaint_date, null)} Days</strong></div>
            <div className="completeRow">
              <input type="date" value={completedDates[complaint.id] || getTodayString()} onChange={(e) => handleCompletedDate(complaint.id, e.target.value)} />
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
              <div className="adminInfo"><span>Complaint Date</span><strong>{formatDMY(complaint.complaint_date)}</strong></div>
              <div className="adminInfo"><span>Completed Date</span><strong>{formatDMY(complaint.completed_date)}</strong></div>
            </div>
            <div className="daysBox completedDays">✓ Repair Duration: <strong>{daysBetween(complaint.complaint_date, complaint.completed_date)} Days</strong></div>
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
  const [mode, setMode] = useState('admin'); // admin-only: 'admin' dashboard vs 'driver' preview

  const [complaints, setComplaints] = useState([]);
  const [complaintsLoading, setComplaintsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [adminSearch, setAdminSearch] = useState('');
  const [completedDates, setCompletedDates] = useState({});
  const [adminView, setAdminView] = useState('dashboard'); // 'dashboard' | 'report' | 'locations'

  // Single shared fetch — used by drivers (report tab), admins (dashboard +
  // report). Employees/vehicles are pulled once per fetch via id lookup maps
  // instead of repeated Array#find calls during render.
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

  function handleCompletedDate(id, date) { setCompletedDates((prev) => ({ ...prev, [id]: date })); }

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
        {currentUser.role === 'driver' ? (
          <DriverExperience
            currentUser={currentUser}
            complaints={complaints}
            complaintsLoading={complaintsLoading}
            complaintsMessage={message}
            onRefresh={fetchComplaints}
          />
        ) : mode === 'driver' ? (
          <DriverExperience
            currentUser={currentUser}
            complaints={complaints}
            complaintsLoading={complaintsLoading}
            complaintsMessage={message}
            onRefresh={fetchComplaints}
          />
        ) : adminView === 'report' ? (
          <ReportView complaints={complaints} loading={complaintsLoading} message={message} showBack onBack={() => setAdminView('dashboard')} />
        ) : adminView === 'locations' ? (
          <LocationManager onBack={() => setAdminView('dashboard')} />
        ) : (
          <AdminDashboard
            complaints={complaints}
            adminSearch={adminSearch}
            setAdminSearch={setAdminSearch}
            refreshing={complaintsLoading}
            message={message}
            completedDates={completedDates}
            handleCompletedDate={handleCompletedDate}
            completeComplaint={completeComplaint}
            onOpenReport={() => setAdminView('report')}
            onOpenLocations={() => setAdminView('locations')}
            onRefresh={fetchComplaints}
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
   2. `users` table (username, password, role, name, gs_no) is a
      stepping stone to #1.
   3. `locations` table (id, name, address) in Supabase for Manage
      Locations / Route Planner — address can be a normal address
      string or "lat,lng"; it's passed straight to Google Maps as
      an origin/destination/waypoint.
   4. PERF: complaints/vehicles/employees are fetched once per
      login (or on explicit refresh/submit/complete) and shared
      across the driver, report, and dashboard views via props —
      no per-screen duplicate queries, and id lookups use Map
      instead of repeated Array#find. Locations load separately
      and only when the Route Planner / Manage Locations screen
      actually mounts, so they never touch the complaints path.
   5. FIXED: RoutePlanner's locationsById Map is keyed by
      String(id), not the raw Supabase numeric id — <select>
      elements always yield string values via e.target.value, so
      a numeric-keyed Map silently failed every lookup. Any future
      dropdown driven by a Supabase id should follow the same
      pattern.
   6. RESPONSIVE/TOUCH: see App.css — 16px form-field font size
      (prevents iOS auto-zoom-on-focus), min-width:0 on flex/grid
      children (prevents mobile overflow), 40px+ touch targets on
      icon-only buttons, touch-action:manipulation app-wide (kills
      the ~300ms tap delay + prevents double-tap zoom), and a
      tablet/desktop breakpoint that widens the app shell and lays
      the Route Planner's Start/End fields out side by side.
===================================================== */
