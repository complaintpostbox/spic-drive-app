import { useCallback, useEffect, useMemo,
useRef, useState } from 'react';
import { supabase } from
'./supabaseClient';
import './App.css';
// Logo lives in /public, referenced by
plain URL (not bundled/imported).
const LOGO_URL = '/spicdrive-logo.png';
// Session persistence key.
const SESSION_KEY =
'spicdrive_current_user';
const VEHICLE_LOCATION_OPTIONS = ['In
Workshop', 'Running in Camp'];
/*
===========================================
==========
HELPERS
===========================================
========== */
function getTodayString() {
const d = new Date();
return
`${d.getFullYear()}-${String(d.getMonth() +
1).padStart(2,
'0')}-${String(d.getDate()).padStart(2,
'0')}`;
}
function daysBetween(start, end) {
const s = new Date(start), e = end ? new
Date(end) : new Date();
const sd = new Date(s.getFullYear(),
s.getMonth(), s.getDate());
const ed = new Date(e.getFullYear(),
e.getMonth(), e.getDate());
return Math.max(0, Math.floor((ed - sd) /
86400000));
}
function formatDMY(dateStr) {
if (!dateStr) return null;
const parts = dateStr.split('-');
if (parts.length !== 3) return dateStr;
const [y, m, d] = parts;
return `${d}-${m}-${y}`;
}
function toMap(rows) {
const m = new Map();
(rows || []).forEach((r) => m.set(r.id,
r));
return m;
}
function loadStoredUser() {
try {
const raw =
localStorage.getItem(SESSION_KEY);
return raw ? JSON.parse(raw) : null;
} catch (e) {
return null;
}
}
function storeUser(user) {
try {
if (user)
localStorage.setItem(SESSION_KEY,
JSON.stringify(user));
else
localStorage.removeItem(SESSION_KEY);
} catch (e) { /* storage unavailable
(private mode etc.) — session just won't
persist */ }
}
async function fetchLocationsData() {
const primary = await
supabase.from('locations').select('*')
.order('sort_order', { ascending: true,
nullsFirst: false })
.order('name', { ascending: true });
if (!primary.error) return { data:
primary.data || [], error: null,
needsSortOrderColumn: false };
const fallback = await
supabase.from('locations').select('*').orde
r('name', { ascending: true });
return { data: fallback.data || [],
error: fallback.error,
needsSortOrderColumn: true };
}
function parseLatLng(location) {
const raw = ((location.address ||
location.name || '') + '').replace(/\s+/g,
' ').trim();
const m = raw.match(/^(-?\d{1,3}
(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
return m ? { lat: parseFloat(m[1]), lng:
parseFloat(m[2]) } : null;
}
function buildWhatsAppShareUrl(location) {
const point = formatMapPoint(location);
const mapsUrl =
`https://www.google.com/maps/search/?
api=1&query=${encodeURIComponent(point)}`;
const lines = [`📍 ${location.name}`];
if (location.address &&
location.address.trim())
lines.push(location.address.trim());
lines.push(mapsUrl);
return `https://wa.me/?
text=${encodeURIComponent(lines.join('\n'))
}`;
}
// Straight-line (haversine) distance in km
— used ONLY as a fallback when
// the OSRM routing service can't be
reached (see fetchRouteSummary below).
function haversineKm(a, b) {
const R = 6371;
const dLat = (b.lat - a.lat) * Math.PI /
180;
const dLng = (b.lng - a.lng) * Math.PI /
180;
const s = Math.sin(dLat / 2) ** 2 +
Math.cos(a.lat * Math.PI / 180) *
Math.cos(b.lat * Math.PI / 180) *
Math.sin(dLng / 2) ** 2;
return R * 2 * Math.atan2(Math.sqrt(s),
Math.sqrt(1 - s));
}
// Queries the free, keyless OSRM public
routing server for the ordered
// sequence of points. Falls back to a
straight-line (haversine) distance +
// a conservative average-speed time
estimate, clearly labeled as an
// estimate, if OSRM can't be reached
(blocked, timed out, CORS, offline).
async function fetchRouteSummary(points) {
const missing = points.filter((p) =>
!parseLatLng(p));
if (missing.length) {
return { error: `These locations have
no saved coordinates, so distance can't be
calculated: ${missing.map((p) =>
p.name).join(', ')}. Add "lat,lng" for them
in Manage Locations, or remove them from
the route.` };
}
const coordsStr = points.map((p) => {
const c = parseLatLng(p); return
`${c.lng},${c.lat}`; }).join(';');
const url = `https://router.projectosrm.
org/route/v1/driving/${coordsStr}?
overview=false&steps=false`;
try {
const controller = new
AbortController();
const timeout = setTimeout(() =>
controller.abort(), 7000);
const res = await fetch(url, { signal:
controller.signal });
clearTimeout(timeout);
const json = await res.json();
if (json.code === 'Ok' && json.routes
&& json.routes[0]) {
const route = json.routes[0];
const legs = route.legs.map((leg, i)
=> ({
from: points[i].name, to: points[i
+ 1].name,
km: leg.distance / 1000, min:
leg.duration / 60,
}));
return { legs, totalKm:
route.distance / 1000, totalMin:
route.duration / 60, estimated: false };
}
} catch (e) {
// fall through to the estimate below —
network blocked, timed out, or CORS
}
// Fallback: straight-line distance, ~40
km/h assumed average (industrial
// site / camp roads) — clearly flagged
as an estimate in the UI.
const AVG_SPEED_KMH = 40;
const coords = points.map(parseLatLng);
const legs = [];
let totalKm = 0;
for (let i = 0; i < coords.length - 1;
i++) {
const km = haversineKm(coords[i],
coords[i + 1]);
totalKm += km;
legs.push({ from: points[i].name, to:
points[i + 1].name, km, min: (km /
AVG_SPEED_KMH) * 60 });
}
return { legs, totalKm, totalMin:
(totalKm / AVG_SPEED_KMH) * 60, estimated:
true };
}
function formatMapPoint(location) {
const source = (location.address &&
location.address.trim()) || (location.name
&& location.name.trim()) || '';
const raw = source.replace(/\s+/g, '
').trim();
const coordMatch = raw.match(/^(-?\d{1,3}
(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
return coordMatch ?
`${coordMatch[1]},${coordMatch[2]}` : raw;
}
function buildGoogleMapsUrl(origin,
destination, waypoints) {
const originStr =
encodeURIComponent(formatMapPoint(origin));
const destinationStr =
encodeURIComponent(formatMapPoint(destinati
on));
const stops =
waypoints.map(formatMapPoint).filter(Boolea
n).map(encodeURIComponent);
let url =
`https://www.google.com/maps/dir/?
api=1&origin=${originStr}&destination=${des
tinationStr}&travelmode=driving`;
if (stops.length) url +=
`&waypoints=${stops.join('|')}`;
return url;
}
/*
===========================================
==========
PASSWORD INPUT (with show/hide toggle)
===========================================
========== */
function PasswordInput({ value, onChange,
placeholder, autoComplete, id }) {
const [visible, setVisible] =
useState(false);
return (
<div className="passwordFieldWrap">
<input
id={id}
type={visible ? 'text' :
'password'}
value={value}
onChange={onChange}
placeholder={placeholder}
autoComplete={autoComplete}
className="passwordFieldInput"
/>
<button
type="button"
className="passwordToggleIcon"
onClick={() => setVisible((v) =>
!v)}
aria-label={visible ? 'Hide
password' : 'Show password'}
tabIndex={-1}
>
{visible ? '🙈' : '👁️'}
</button>
</div>
);
}
/*
===========================================
==========
LOGIN SCREEN
===========================================
========== */
function LoginScreen({ onLogin }) {
const [username, setUsername] =
useState('');
const [password, setPassword] =
useState('');
const [error, setError] = useState('');
const [loading, setLoading] =
useState(false);
async function submit(e) {
e.preventDefault();
if (!username.trim() || !password) {
setError('Enter both username and
password.'); return; }
setLoading(true); setError('');
const { data, error: err } = await
supabase
.from('users').select('*').eq('username',
username.trim()).eq('password',
password).maybeSingle();
setLoading(false);
if (err) { setError(err.message);
return; }
if (!data) { setError('Incorrect
username or password.'); return; }
onLogin(data);
}
return (
<div className="loginWrap">
<div className="loginGlow" />
<div className="loginCard">
<div className="loginBadge"><img
src={LOGO_URL} alt="SPIC DRIVE"
className="loginLogoImg" /></div>
<h1 className="loginBrand">SPIC
DRIVE</h1>
<p className="loginSub">Enterprise
Fleet &amp; Workshop Intelligence</p>
<form onSubmit={submit}
className="loginForm">
<label
className="loginLabel">Username</label>
<div className="loginInputRow">
<input value={username}
onChange={(e) =>
setUsername(e.target.value)}
placeholder="Enter username"
autoComplete="username" />
</div>
<label
className="loginLabel">Password</label>
<div className="loginInputRow
loginInputRowPassword">
<PasswordInput value={password}
onChange={(e) =>
setPassword(e.target.value)}
placeholder="Enter password"
autoComplete="current-password" />
</div>
{error && <div
className="loginError">⚠ {error}</div>}
<button className="loginButton"
type="submit" disabled={loading}>
{loading ? <span
className="spinner light" /> : 'Sign In'}
</button>
</form>
</div>
</div>
);
}
/*
===========================================
==========
CHANGE PASSWORD (any logged-in user)
===========================================
========== */
function ChangePasswordPanel({ currentUser,
onClose, onUpdated }) {
const [currentPassword,
setCurrentPassword] = useState('');
const [newUsername, setNewUsername] =
useState(currentUser.username);
const [newPassword, setNewPassword] =
useState('');
const [confirmPassword,
setConfirmPassword] = useState('');
const [saving, setSaving] =
useState(false);
const [message, setMessage] =
useState('');
const [isError, setIsError] =
useState(false);
async function save() {
setMessage(''); setIsError(false);
if (!currentPassword) {
setIsError(true); setMessage('Enter your
current password.'); return; }
if (!newUsername.trim()) {
setIsError(true); setMessage('Username
cannot be empty.'); return; }
if (newPassword && newPassword !==
confirmPassword) { setIsError(true);
setMessage('New passwords do not match.');
return; }
setSaving(true);
// Re-check against the live row, not
the in-memory copy, in case it
// changed since login (e.g. an admin
reset it).
const { data: fresh, error: fetchErr }
= await
supabase.from('users').select('*').eq('id',
currentUser.id).maybeSingle();
if (fetchErr || !fresh) {
setSaving(false); setIsError(true);
setMessage('Could not verify your
account.'); return; }
if (fresh.password !== currentPassword)
{ setSaving(false); setIsError(true);
setMessage('Current password is
incorrect.'); return; }
const patch = { username:
newUsername.trim() };
if (newPassword) patch.password =
newPassword;
const { data: updated, error } = await
supabase.from('users').update(patch).eq('id
', currentUser.id).select().maybeSingle();
setSaving(false);
if (error) {
setIsError(true);
setMessage(error.message.includes('duplicat
e') ? 'That username is already taken.' :
'Update failed: ' + error.message);
return;
}
setIsError(false);
setMessage('✓ Saved. Use your new
credentials next time you sign in.');
setCurrentPassword('');
setNewPassword(''); setConfirmPassword('');
onUpdated?.(updated);
}
return (
<section className="card">
<div className="sectionTitle">
<span className="iconCircle
iconIndigo">🔑</span>
<div><h2>Change Username /
Password</h2><p>Update your own sign-in
credentials</p></div>
</div>
<div className="dateField">
<label
className="fieldLabel">Current
Password</label>
<PasswordInput value=
{currentPassword} onChange={(e) =>
setCurrentPassword(e.target.value)}
placeholder="Required to confirm it's you"
/>
</div>
<div className="dateField">
<label
className="fieldLabel">Username</label>
<input value={newUsername}
onChange={(e) =>
setNewUsername(e.target.value)} />
</div>
<div className="dateField">
<label className="fieldLabel">New
Password (leave blank to keep current)
</label>
<PasswordInput value={newPassword}
onChange={(e) =>
setNewPassword(e.target.value)} />
</div>
{newPassword && (
<div className="dateField">
<label
className="fieldLabel">Confirm New
Password</label>
<PasswordInput value=
{confirmPassword} onChange={(e) =>
setConfirmPassword(e.target.value)} />
</div>
)}
{message && <div className={isError ?
'errorMessage' : 'saveMessage'}>{isError ?
'⚠ ' : ''}{message}</div>}
<div className="completeRow">
<button className="submitButton"
onClick={save} disabled={saving} style={{
flex: 1 }}>
{saving ? <span
className="spinner light" /> : 'Save
Changes'}
</button>
<button className="deleteComplaint
locationCancelBtn" onClick=
{onClose}>Close</button>
</div>
</section>
);
}
/*
===========================================
==========
SUBMIT COMPLAINT PANEL
===========================================
========== */
function SubmitComplaintPanel({
currentUser, onSubmitted }) {
const [gsNo, setGsNo] =
useState(currentUser.role === 'driver' ?
(currentUser.gs_no || '') : '');
const [employee, setEmployee] =
useState(null);
const [employeeMessage,
setEmployeeMessage] = useState('');
const [employeeLoading,
setEmployeeLoading] = useState(false);
const [vehicleNo, setVehicleNo] =
useState('');
const [vehicle, setVehicle] =
useState(null);
const [vehicleMessage, setVehicleMessage]
= useState('');
const [vehicleLoading, setVehicleLoading]
= useState(false);
const [complaintDate, setComplaintDate] =
useState(getTodayString());
const [vehicleLocation,
setVehicleLocation] =
useState(VEHICLE_LOCATION_OPTIONS[0]);
const [complaints, setComplaints] =
useState(['']);
const [saving, setSaving] =
useState(false);
const [saveMessage, setSaveMessage] =
useState('');
const findEmployee = useCallback(async ()
=> {
if (!gsNo.trim()) { setEmployee(null);
setEmployeeMessage('Please enter GS No');
return; }
setEmployeeLoading(true);
setEmployeeMessage('');
const { data, error } = await
supabase.from('employees').select('*').eq('
gs_no', gsNo.trim()).maybeSingle();
setEmployeeLoading(false);
if (error) { setEmployee(null);
setEmployeeMessage(error.message); return;
}
if (!data) { setEmployee(null);
setEmployeeMessage('Employee not found');
return; }
setEmployee(data);
}, [gsNo]);
useEffect(() => {
if (currentUser.role === 'driver' &&
currentUser.gs_no) findEmployee();
// eslint-disable-next-line reacthooks/
exhaustive-deps
}, []);
const findVehicle = useCallback(async ()
=> {
if (!vehicleNo.trim()) {
setVehicle(null); setVehicleMessage('Please
enter Plate No or Asset No'); return; }
setVehicleLoading(true);
setVehicleMessage('');
const value = vehicleNo.trim();
const { data, error } = await
supabase.from('vehicles').select('*').or(`p
late_no.eq.${value},asset_no.eq.${value}`).
limit(1).maybeSingle();
setVehicleLoading(false);
if (error) { setVehicle(null);
setVehicleMessage(error.message); return; }
if (!data) { setVehicle(null);
setVehicleMessage('Vehicle not found');
return; }
setVehicle(data);
}, [vehicleNo]);
function addComplaint() {
setComplaints((c) => [...c, '']); }
function updateComplaint(i, v) {
setComplaints((c) => c.map((t, idx) => (idx
=== i ? v : t))); }
function removeComplaint(i) {
setComplaints((c) => (c.length === 1 ? c :
c.filter((_, idx) => idx !== i))); }
async function submitComplaints() {
setSaveMessage('');
if (!employee) return
setSaveMessage('Please search and select an
employee first.');
if (!vehicle) return
setSaveMessage('Please search and select a
vehicle first.');
if (!complaintDate) return
setSaveMessage('Please select a complaint
date.');
const valid = complaints.map((t) =>
t.trim()).filter(Boolean);
if (!valid.length) return
setSaveMessage('Please enter at least one
complaint.');
setSaving(true);
const records = valid.map((text) => ({
employee_id: employee.id, vehicle_id:
vehicle.id,
complaint_text: text, complaint_date:
complaintDate, status: 'Pending',
vehicle_location: vehicleLocation,
}));
const { error } = await
supabase.from('complaint_records').insert(r
ecords);
setSaving(false);
if (error) return setSaveMessage('Save
failed: ' + error.message);
setSaveMessage(`✓ ${valid.length}
complaint(s) submitted successfully.`);
setComplaints(['']);
setComplaintDate(getTodayString());
onSubmitted?.();
}
return (
<>
<section className="card">
<div className="sectionTitle">
<span className="iconCircle
iconIndigo">👤</span>
<div><h2>Driver Verification</h2>
<p>Enter GS Number to confirm identity</p>
</div>
</div>
<div className="searchRow">
<input value={gsNo} onChange={(e)
=> setGsNo(e.target.value)} onKeyDown={(e)
=> e.key === 'Enter' && findEmployee()}
placeholder="Enter GS No" />
<button className="btnPrimary"
onClick={findEmployee}>{employeeLoading ?
<span className="spinner" /> : 'Search'}
</button>
</div>
{employeeMessage && <div
className="errorMessage">⚠
{employeeMessage}</div>}
{employee && (
<div className="successBox
fadeIn">
<div className="verified"><span
className="checkBadge">✓</span> Verified
Employee</div>
<div className="infoGrid">
<div className="infoRow">
<span>Name</span><strong>{employee.name ||
'-'}</strong></div>
<div className="infoRow">
<span>GS No</span><strong>{employee.gs_no
|| '-'}</strong></div>
<div className="infoRow">
<span>Designation</span><strong>
{employee.designation || '-'}</strong>
</div>
<div className="infoRow">
<span>Phone</span><strong>{employee.phone
|| '-'}</strong></div>
</div>
</div>
)}
</section>
<section className="card">
<div className="sectionTitle">
<span className="iconCircle
iconGold">🚐</span>
<div><h2>Vehicle Details</h2>
<p>Enter Plate No or Asset No</p></div>
</div>
<div className="searchRow">
<input value={vehicleNo}
onChange={(e) =>
setVehicleNo(e.target.value)} onKeyDown=
{(e) => e.key === 'Enter' && findVehicle()}
placeholder="Plate No / Asset No" />
<button className="btnPrimary"
onClick={findVehicle}>{vehicleLoading ?
<span className="spinner" /> : 'Search'}
</button>
</div>
{vehicleMessage && <div
className="errorMessage">⚠
{vehicleMessage}</div>}
{vehicle && (
<div className="successBox
fadeIn">
<div className="verified"><span
className="checkBadge">✓</span> Vehicle
Found</div>
<div className="vehicleMain">
<strong>{vehicle.plate_no || '-'}</strong>
<span>{vehicle.equipment_description || '-
'}</span></div>
<div className="infoGrid">
<div className="infoRow">
<span>Asset No</span><strong>
{vehicle.asset_no || '-'}</strong></div>
<div className="infoRow">
<span>Make / Model</span><strong>
{vehicle.make || '-'} / {vehicle.model ||
'-'}</strong></div>
</div>
</div>
)}
</section>
<section className="card">
<div className="sectionTitle">
<span className="iconCircle
iconAmber">🔧</span>
<div><h2>Workshop Complaint</h2>
<p>Add one or more vehicle problems</p>
</div>
</div>
<div className="dateField">
<label className="fieldLabel"
htmlFor="complaintDate">Complaint
Date</label>
<input id="complaintDate"
type="date" value={complaintDate} max=
{getTodayString()} onChange={(e) =>
setComplaintDate(e.target.value)} />
</div>
<div className="dateField">
<label
className="fieldLabel">Vehicle
Location</label>
<select value={vehicleLocation}
onChange={(e) =>
setVehicleLocation(e.target.value)}>
{VEHICLE_LOCATION_OPTIONS.map((opt) =>
<option key={opt} value={opt}>{opt}
</option>)}
</select>
</div>
{complaints.map((complaint, index)
=> (
<div className="complaintItem"
key={index}>
<div
className="complaintHeader">
<span
className="complaintTag">Complaint {index +
1}</span>
{complaints.length > 1 &&
<button className="deleteComplaint"
onClick={() =>
removeComplaint(index)}>✕</button>}
</div>
<textarea value={complaint}
onChange={(e) => updateComplaint(index,
e.target.value)} placeholder="Type your
problem here..." rows="3" />
</div>
))}
<button
className="addComplaintButton" onClick=
{addComplaint}>＋ Add Another
Complaint</button>
<button className="submitButton"
onClick={submitComplaints} disabled=
{saving}>
{saving ? <span
className="spinner light" /> : 'SUBMIT
COMPLAINT'}
</button>
{saveMessage && <div
className="saveMessage fadeIn">
{saveMessage}</div>}
</section>
</>
);
}
/*
===========================================
==========
REPORT VIEW (read-only)
===========================================
========== */
const FILTER_LABELS = { all: 'All
Complaints', pending: 'Pending Complaints',
completed: 'Completed Complaints' };
function driverLabel(c) {
if (!c.employees?.name) return '-';
return c.employees.gs_no ?
`${c.employees.gs_no} ${c.employees.name}`
: c.employees.name;
}
function ReportView({ complaints, loading,
message, onBack, showBack }) {
const [filter, setFilter] =
useState('all');
const [q, setQ] = useState('');
const rows = useMemo(() => {
let r = complaints;
if (filter === 'pending') r =
r.filter((c) => c.status === 'Pending');
if (filter === 'completed') r =
r.filter((c) => c.status === 'Completed');
const s = q.trim().toLowerCase();
if (s) r = r.filter((c) =>
(c.vehicles?.plate_no ||
'').toLowerCase().includes(s) ||
(c.vehicles?.asset_no ||
'').toLowerCase().includes(s));
return r;
}, [complaints, filter, q]);
function exportCsv() {
const header = ['#', 'Vehicle',
'Driver', 'Complaint', 'Vehicle Location',
'Complaint Date', 'Completed Date',
'Status', 'Days', 'Remarks'];
const lines = rows.map((c, i) => [
i + 1, c.vehicles?.plate_no || '-',
driverLabel(c),
`"${(c.complaint_text ||
'').replace(/"/g, '""')}"`,
c.vehicle_location || '-',
formatDMY(c.complaint_date) || '-',
formatDMY(c.completed_date) || '-',
c.status,
daysBetween(c.complaint_date,
c.completed_date),
`"${(c.remarks || '').replace(/"/g,
'""')}"`,
].join(','));
const csv = [header.join(','),
...lines].join('\n');
const blob = new Blob([csv], { type:
'text/csv' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url; a.download = `spicdrive-${
filter}-
report-${getTodayString()}.csv`; a.click();
URL.revokeObjectURL(url);
}
return (
<div id="reportPrintArea">
{showBack && (
<div className="reportTopBar
noPrint">
<button
className="reportBackButton" onClick=
{onBack}>← Back to Dashboard</button>
</div>
)}
<section
className="reportLetterhead">
<img src={LOGO_URL} alt="SPIC
DRIVE" className="reportLetterheadLogo" />
<div
className="reportLetterheadText">
<h2>SPIC DRIVE</h2>
<p>Workshop Complaint Report</p>
</div>
<div
className="reportLetterheadMeta">
<span>{FILTER_LABELS[filter]}
</span>
<span>Generated
{formatDMY(getTodayString())}</span>
</div>
</section>
<section className="card noPrint">
<div className="filterTabs">
<button className={filter ===
'all' ? 'filterTab activeFilter' :
'filterTab'} onClick={() =>
setFilter('all')}>Total (All)</button>
<button className={filter ===
'pending' ? 'filterTab activeFilter' :
'filterTab'} onClick={() =>
setFilter('pending')}>Pending</button>
<button className={filter ===
'completed' ? 'filterTab activeFilter' :
'filterTab'} onClick={() =>
setFilter('completed')}>Completed</button>
</div>
<div className="reportSearchRow">
<input value={q} onChange={(e) =>
setQ(e.target.value)} placeholder="Filter
by Plate No / Asset No" />
</div>
<div className="reportActionsRow">
<button
className="exportCsvButton" onClick=
{exportCsv}>⬇ Export CSV</button>
<button
className="printReportButton" onClick={()
=> window.print()}>🖨 Print Report</button>
</div>
</section>
<section className="card">
<div
className="reportTableCaption">
<span>{FILTER_LABELS[filter]}
</span>
<span
className="reportTableCount">{loading ?
'Loading…' : `${rows.length}
record${rows.length === 1 ? '' : 's'}`}
</span>
</div>
{message && <div
className="errorMessage">⚠ {message}
</div>}
<div
className="reportTableWrapper">
<table className="reportTable">
<thead>
<tr>
<th>#</th><th>Vehicle</th>
<th>Driver</th><th
className="reportComplaintCell">Complaint</
th>
<th>Vehicle Location</th>
<th>Complaint Date</th><th>Completed
Date</th><th>Status</th><th>Days</th>
<th>Remarks</th>
</tr>
</thead>
<tbody>
{rows.map((c, i) => (
<tr key={c.id}>
<td>{i + 1}</td>
<td>{c.vehicles?.plate_no
|| '-'}</td>
<td>{driverLabel(c)}</td>
<td
className="reportComplaintCell">
{c.complaint_text}</td>
<td>{c.vehicle_location
|| '-'}</td>
<td>
{formatDMY(c.complaint_date) || '-'}</td>
<td>
{formatDMY(c.completed_date) || '—'}</td>
<td><span className=
{c.status === 'Pending' ? 'badge
pendingBadge' : 'badge completedBadge'}>
{c.status.toUpperCase()}</span></td>
<td>
{daysBetween(c.complaint_date,
c.completed_date)}</td>
<td
className="reportComplaintCell">{c.remarks
|| '-'}</td>
</tr>
))}
{!loading && rows.length ===
0 && (
<tr><td colSpan={10} style=
{{ textAlign: 'center', padding: '24px',
color: 'var(--slate-500)' }}>No matching
records</td></tr>
)}
</tbody>
</table>
</div>
</section>
</div>
);
}
/*
===========================================
==========
SEARCHABLE LOCATION PICKER
===========================================
========== */
function LocationPicker({ locations,
valueId, onSelect, placeholder }) {
const [editing, setEditing] =
useState(false);
const [query, setQuery] = useState('');
const selected = valueId ?
locations.find((l) => String(l.id) ===
String(valueId)) : null;
const results = useMemo(() => {
const s = query.trim().toLowerCase();
if (!s) return locations;
return locations.filter((l) =>
l.name.toLowerCase().includes(s) ||
(l.address ||
'').toLowerCase().includes(s));
}, [locations, query]);
function pick(id) { onSelect(String(id));
setEditing(false); setQuery(''); }
function clear(e) { e.stopPropagation();
onSelect(''); }
if (!editing) {
return (
<button type="button"
className="locationPickerClosed" onClick=
{() => setEditing(true)}>
<span className={selected ?
'locationPickerValue' :
'locationPickerPlaceholder'}>
{selected ? selected.name :
(placeholder || 'Select location')}
</span>
<span
className="locationPickerRightIcons">
{selected && <span
className="locationPickerClear" onClick=
{clear} role="button" aria-label="Clear
selection">✕</span>}
<span
className="locationPickerCaret">▾</span>
</span>
</button>
);
}
return (
<div className="locationPickerOpen">
<div
className="locationPickerSearchRow">
<input autoFocus value={query}
onChange={(e) => setQuery(e.target.value)}
placeholder="Type to search locations..."
/>
<button type="button"
className="locationPickerCancel" onClick=
{() => { setEditing(false); setQuery('');
}}>Cancel</button>
</div>
<div className="locationPickerList">
{results.length === 0 && <div
className="emptyState">No matching
locations</div>}
{results.map((l) => (
<button
type="button" key={l.id}
className={String(l.id) ===
String(valueId) ? 'locationPickerOption
locationPickerOptionActive' :
'locationPickerOption'}
onClick={() => pick(l.id)}
>
<strong>{l.name}</strong>
{l.address && <span>{l.address}
</span>}
</button>
))}
</div>
</div>
);
}
/*
===========================================
==========
QUICK SHARE (WhatsApp)
===========================================
========== */
function QuickShareLocations({ locations })
{
const [q, setQ] = useState('');
const results = useMemo(() => {
const s = q.trim().toLowerCase();
if (!s) return locations;
return locations.filter((l) =>
l.name.toLowerCase().includes(s) ||
(l.address ||
'').toLowerCase().includes(s));
}, [locations, q]);
return (
<section className="card">
<div className="sectionTitle">
<span className="iconCircle
iconGold">💬</span>
<div><h2>Quick Share</h2><p>Find a
location and send it via WhatsApp
instantly</p></div>
</div>
<div className="dateField">
<input value={q} onChange={(e) =>
setQ(e.target.value)} placeholder="Search a
location by name..." />
</div>
<div className="quickShareList">
{results.length === 0 && <div
className="emptyState">No matching
locations</div>}
{results.slice(0, 8).map((l) => (
<div className="quickShareRow"
key={l.id}>
<div
className="quickShareInfo"><strong>{l.name}
</strong></div>
<a
className="whatsappShareButton" href=
{buildWhatsAppShareUrl(l)} target="_blank"
rel="noopener noreferrer">💬 Share</a>
</div>
))}
{results.length > 8 && <p
className="loadingText">{results.length -
8} more match — keep typing to narrow it
down.</p>}
</div>
</section>
);
}
/*
===========================================
==========
ROUTE PLANNER (driver-only tab)
===========================================
========== */
function RoutePlanner() {
const [locations, setLocations] =
useState([]);
const [loading, setLoading] =
useState(true);
const [message, setMessage] =
useState('');
const [startId, setStartId] =
useState('');
const [endId, setEndId] = useState('');
const [stopIds, setStopIds] =
useState([]);
const [summary, setSummary] =
useState(null);
const [summaryLoading, setSummaryLoading]
= useState(false);
const [summaryMessage, setSummaryMessage]
= useState('');
useEffect(() => {
let active = true;
(async () => {
const { data, error } = await
fetchLocationsData();
if (!active) return;
if (error) { setMessage('Could not
load locations: ' + error.message);
setLoading(false); return; }
setLocations(data);
setLoading(false);
})();
return () => { active = false; };
}, []);
const locationsById = useMemo(() => {
const m = new Map();
locations.forEach((l) =>
m.set(String(l.id), l));
return m;
}, [locations]);
function addStop() { setStopIds((s) =>
[...s, '']); }
function updateStop(i, v) {
setStopIds((s) => s.map((x, idx) => (idx
=== i ? v : x))); }
function removeStop(i) { setStopIds((s)
=> s.filter((_, idx) => idx !== i)); }
function invalidateSummary() {
setSummary(null); setSummaryMessage(''); }
const canOpen = Boolean(startId &&
endId);
function orderedPoints() {
const origin =
locationsById.get(startId);
const destination =
locationsById.get(endId);
const waypoints = stopIds.map((id) =>
locationsById.get(id)).filter(Boolean);
return { origin, destination, waypoints
};
}
async function calculateSummary() {
const { origin, destination, waypoints
} = orderedPoints();
if (!origin || !destination) {
setSummaryMessage('Select a start and end
point first.'); return; }
setSummaryLoading(true);
setSummaryMessage(''); setSummary(null);
const result = await
fetchRouteSummary([origin, ...waypoints,
destination]);
setSummaryLoading(false);
if (result.error) {
setSummaryMessage(result.error); return; }
setSummary(result);
}
function openInGoogleMaps() {
const { origin, destination, waypoints
} = orderedPoints();
if (!origin || !destination) {
setMessage('Could not match the selected
start/end location — please re-select them
and try again.'); return; }
if (!formatMapPoint(origin) ||
!formatMapPoint(destination)) {
setMessage('The selected start or end
location has no name or address saved —
edit it in Manage Locations first.');
return; }
setMessage('');
window.open(buildGoogleMapsUrl(origin,
destination, waypoints), '_blank',
'noopener,noreferrer');
}
return (
<>
<section className="card">
<div className="sectionTitle">
<span className="iconCircle
iconIndigo">🗺️</span>
<div><h2>Route Planner</h2>
<p>Build a multi-stop trip and open it in
Google Maps</p></div>
</div>
{loading && <p
className="loadingText">Loading
locations...</p>}
{message && <div
className="errorMessage">⚠ {message}
</div>}
{!loading && locations.length === 0
&& !message && (
<div className="emptyState">No
saved locations yet — ask an admin to add
some in Manage Locations.</div>
)}
{!loading && locations.length > 0
&& (
<>
<div
className="routeEndpoints">
<div className="dateField">
<label
className="fieldLabel">Starting
Point</label>
<LocationPicker locations=
{locations} valueId={startId} onSelect=
{(id) => { setStartId(id);
invalidateSummary(); }} placeholder="Select
starting location" />
</div>
<div className="dateField">
<label
className="fieldLabel">End Point</label>
<LocationPicker locations=
{locations} valueId={endId} onSelect={(id)
=> { setEndId(id); invalidateSummary(); }}
placeholder="Select destination" />
</div>
</div>
{stopIds.map((id, i) => (
<div className="dateField"
key={i}>
<label
className="fieldLabel">Point {i + 1}
</label>
<div
className="routeStopRow">
<div
className="routeStopPicker">
<LocationPicker
locations={locations} valueId={id}
onSelect={(newId) => { updateStop(i,
newId); invalidateSummary(); }}
placeholder="Select stop" />
</div>
<button
className="removeStopButton" onClick={() =>
{ removeStop(i); invalidateSummary(); }}
aria-label={`Remove point ${i +
1}`}>✕</button>
</div>
</div>
))}
<button
className="addComplaintButton" onClick={()
=> { addStop(); invalidateSummary(); }}>＋
Add Point</button>
{stopIds.length > 8 && <div
className="errorMessage">⚠ Google Maps
supports up to 9 stops — consider splitting
long routes.</div>}
<button className="btnPrimary
routeSummaryButton" onClick=
{calculateSummary} disabled={!canOpen ||
summaryLoading}>
{summaryLoading ? <span
className="spinner" /> : '📊 Calculate
Distance & Time'}
</button>
{summaryMessage && <div
className="errorMessage">⚠
{summaryMessage}</div>}
{summary && (
<div
className="routeSummaryBox fadeIn">
{summary.estimated && (
<div
className="routeSummaryEstimateNote">
ⓘ Routing service
unreachable on this network — showing an
estimated straight-line distance instead of
the actual road route.
</div>
)}
{summary.legs.map((leg, i)
=> (
<div
className="routeSummaryLeg" key={i}>
<span
className="routeSummaryLegNames">{leg.from}
→ {leg.to}</span>
<span
className="routeSummaryLegStats">
{leg.km.toFixed(1)} km ·
{Math.round(leg.min)} min</span>
</div>
))}
<div
className="routeSummaryTotal">
<span>Total{summary.estimated ? ' (est.)' :
''}</span>
<span>
{summary.totalKm.toFixed(1)} km ·
{Math.round(summary.totalMin)} min</span>
</div>
</div>
)}
<button
className="submitButton" onClick=
{openInGoogleMaps} disabled={!canOpen}>🗺
Open Route in Google Maps</button>
<p
className="loadingText">Distance &amp;
travel time above are a planning estimate —
Google Maps recalculates them itself once
opened.</p>
</>
)}
</section>
{!loading && locations.length > 0 &&
<QuickShareLocations locations={locations}
/>}
</>
);
}
/*
===========================================
==========
DRIVER EXPERIENCE
===========================================
========== */
function DriverExperience({ currentUser,
complaints, complaintsLoading,
complaintsMessage, onRefresh }) {
const [tab, setTab] = useState('submit');
return (
<>
<div className="modeSwitch
driverTabs">
<button className={tab === 'submit'
? 'modeButton activeMode' : 'modeButton'}
onClick={() => setTab('submit')}>📝 Submit
Complaint</button>
<button className={tab === 'report'
? 'modeButton activeMode' : 'modeButton'}
onClick={() => setTab('report')}>📋
Complaint Status</button>
<button className={tab === 'route'
? 'modeButton activeMode' : 'modeButton'}
onClick={() => setTab('route')}>🗺️ Route
Map</button>
</div>
{tab === 'submit' &&
<SubmitComplaintPanel currentUser=
{currentUser} onSubmitted={onRefresh} />}
{tab === 'report' && <ReportView
complaints={complaints} loading=
{complaintsLoading} message=
{complaintsMessage} showBack={false} />}
{tab === 'route' && <RoutePlanner />}
</>
);
}
/*
===========================================
==========
DRAGGABLE LIST (Pointer Events — mouse +
touch, no library)
===========================================
========== */
function DraggableList({ items, getId,
onReordered, disabled, renderRow }) {
const [order, setOrder] =
useState(items.map(getId));
const [draggingId, setDraggingId] =
useState(null);
const orderRef = useRef(order);
orderRef.current = order;
useEffect(() => {
setOrder(items.map(getId)); }, [items,
getId]);
const byId = useMemo(() => {
const m = new Map();
items.forEach((it) => m.set(getId(it),
it));
return m;
}, [items, getId]);
const ordered = order.map((id) =>
byId.get(id)).filter(Boolean);
function handlePointerDown(e, id) {
if (disabled) return;
e.currentTarget.setPointerCapture(e.pointer
Id);
setDraggingId(id);
}
function handlePointerMove(e) {
if (draggingId == null) return;
const el =
document.elementFromPoint(e.clientX,
e.clientY);
const rowEl = el && el.closest('[datadrag-
row]');
if (!rowEl) return;
const overId =
rowEl.getAttribute('data-drag-row');
if (!overId || overId ===
String(draggingId)) return;
const prev = orderRef.current;
const from = prev.findIndex((x) =>
String(x) === String(draggingId));
const to = prev.findIndex((x) =>
String(x) === overId);
if (from === -1 || to === -1 || from
=== to) return;
const next = prev.slice();
next.splice(from, 1);
next.splice(to, 0, draggingId);
setOrder(next);
}
function handlePointerUp() {
if (draggingId == null) return;
setDraggingId(null);
onReordered(orderRef.current);
}
return (
<div className="dragList">
{ordered.map((item, index) => {
const id = getId(item);
return (
<div key={id} data-drag-row={id}
className={String(draggingId) ===
String(id) ? 'dragRow dragRowActive' :
'dragRow'}>
{renderRow(item, index, {
onPointerDown: (e) =>
handlePointerDown(e, id),
onPointerMove:
handlePointerMove,
onPointerUp: handlePointerUp,
onPointerCancel:
handlePointerUp,
})}
</div>
);
})}
</div>
);
}
/*
===========================================
==========
MANAGE LOCATIONS (admin-only)
===========================================
========== */
function LocationManager({ onBack }) {
const [locations, setLocations] =
useState([]);
const [loading, setLoading] =
useState(true);
const [message, setMessage] =
useState('');
const [needsMigration, setNeedsMigration]
= useState(false);
const [name, setName] = useState('');
const [address, setAddress] =
useState('');
const [saving, setSaving] =
useState(false);
const [editingId, setEditingId] =
useState(null);
const [editName, setEditName] =
useState('');
const [editAddress, setEditAddress] =
useState('');
const [reordering, setReordering] =
useState(false);
const load = useCallback(async () => {
setLoading(true); setMessage('');
const { data, error,
needsSortOrderColumn } = await
fetchLocationsData();
setNeedsMigration(Boolean(needsSortOrderCol
umn));
if (error) { setMessage('Load failed: '
+ error.message); setLoading(false);
return; }
if (!needsSortOrderColumn &&
data.some((l) => l.sort_order === null ||
l.sort_order === undefined)) {
const updates = data.map((l, i) => ({
id: l.id, sort_order: l.sort_order ?? i
}));
await Promise.all(updates.map((u) =>
supabase.from('locations').update({
sort_order: u.sort_order }).eq('id',
u.id)));
const refetch = await
fetchLocationsData();
setLocations(refetch.data);
setLoading(false);
return;
}
setLocations(data);
setLoading(false);
}, []);
useEffect(() => { load(); }, [load]);
async function addLocation() {
if (!name.trim()) { setMessage('Enter a
location name.'); return; }
setSaving(true);
const nextOrder = locations.length ?
Math.max(...locations.map((l) =>
l.sort_order ?? 0)) + 1 : 0;
const payload = { name: name.trim(),
address: address.trim() || null };
if (!needsMigration) payload.sort_order
= nextOrder;
const { error } = await
supabase.from('locations').insert(payload);
setSaving(false);
if (error) { setMessage('Save failed: '
+ error.message); return; }
setName(''); setAddress('');
load();
}
function startEdit(loc) {
setEditingId(loc.id);
setEditName(loc.name);
setEditAddress(loc.address || ''); }
function cancelEdit() {
setEditingId(null); }
async function saveEdit(id) {
if (!editName.trim()) {
setMessage('Name cannot be empty.');
return; }
const { error } = await
supabase.from('locations').update({ name:
editName.trim(), address:
editAddress.trim() || null }).eq('id', id);
if (error) { setMessage('Update failed:
' + error.message); return; }
setEditingId(null);
load();
}
async function deleteLocation(id) {
const { error } = await
supabase.from('locations').delete().eq('id'
, id);
if (error) { setMessage('Delete failed:
' + error.message); return; }
load();
}
async function
handleReordered(newOrderIds) {
if (needsMigration) { setMessage('Add
the sort_order column first — see the setup
note above.'); return; }
setReordering(true);
await Promise.all(newOrderIds.map((id,
index) =>
supabase.from('locations').update({
sort_order: index }).eq('id', id)));
setReordering(false);
load();
}
return (
<>
<div className="reportTopBar
noPrint">
<button
className="reportBackButton" onClick=
{onBack}>← Back to Dashboard</button>
</div>
{needsMigration && (
<div className="errorMessage">
⚠ Ordering isn't set up yet —
run this once in the Supabase SQL editor,
then reload this page:
{' '}<code>alter table locations
add column sort_order integer;</code>
</div>
)}
<section className="card">
<div className="sectionTitle">
<span className="iconCircle
iconGold">📍</span>
<div><h2>Manage Locations</h2>
<p>Stations &amp; project sites used by the
Route Planner (40–50 typical)</p></div>
</div>
<div className="dateField">
<label
className="fieldLabel">Location
Name</label>
<input value={name} onChange={(e)
=> setName(e.target.value)}
placeholder="e.g. F Camp, Station 140" />
</div>
<div className="dateField">
<label
className="fieldLabel">Address /
Coordinates (optional)</label>
<input value={address} onChange=
{(e) => setAddress(e.target.value)}
placeholder="Full address, or lat,lng —
used for Google Maps" />
</div>
<button className="submitButton"
onClick={addLocation} disabled={saving}>
{saving ? <span
className="spinner light" /> : '＋ Add
Location'}
</button>
{message && <div
className="errorMessage">⚠ {message}
</div>}
</section>
<section className="card">
<div className="adminSectionTitle">
<span>📍 Locations</span>
<span className="countBadge
pendingCount">{locations.length}</span>
</div>
<p className="loadingText">Drag the
⠿ handle to reorder — this order drives
every dropdown &amp; the Route Planner.</p>
{loading && <p
className="loadingText">Loading...</p>}
{!loading && locations.length === 0
&& <div className="emptyState">No locations
added yet</div>}
{!loading && locations.length > 0
&& (
<DraggableList
items={locations}
getId={(l) => l.id}
disabled={reordering ||
needsMigration}
onReordered={handleReordered}
renderRow={(loc, index,
dragHandleProps) => (
<div
className="adminComplaint locationRow">
{editingId === loc.id ? (
<>
<div
className="dateField">
<label
className="fieldLabel">Name</label>
<input value=
{editName} onChange={(e) =>
setEditName(e.target.value)} />
</div>
<div
className="dateField">
<label
className="fieldLabel">Address /
Coordinates</label>
<input value=
{editAddress} onChange={(e) =>
setEditAddress(e.target.value)}
placeholder="Address / lat,lng" />
</div>
<div
className="completeRow">
<button
className="completeButton" onClick={() =>
saveEdit(loc.id)}>✓ Save</button>
<button
className="deleteComplaint
locationCancelBtn" onClick={cancelEdit}>✕
Cancel</button>
</div>
</>
) : (
<>
<div
className="locationRowBody">
<div
className="dragHandle" {...dragHandleProps}
aria-label="Drag to reorder">⠿</div>
<div
className="locationRowInfo">
<div
className="adminComplaintTop"><strong>
{loc.name}</strong></div>
<div
className="adminInfoGrid">
<div
className="adminInfo"><span>Address /
Coordinates</span><strong>{loc.address ||
'-'}</strong></div>
</div>
</div>
</div>
<div
className="completeRow">
<a
className="whatsappShareButton" href=
{buildWhatsAppShareUrl(loc)}
target="_blank" rel="noopener noreferrer">
💬 Share</a>
<button
className="btnPrimary" onClick={() =>
startEdit(loc)}>Edit</button>
<button
className="deleteComplaint
locationCancelBtn" onClick={() =>
deleteLocation(loc.id)}>Delete</button>
</div>
</>
)}
</div>
)}
/>
)}
</section>
</>
);
}
/*
===========================================
==========
ADMIN COMPLAINTS TABLE (Pending /
Completed)
===========================================
========== */
function AdminComplaintsTable({ variant,
rows, completedDates,
onCompletedDateChange, onMarkComplete,
onEdit }) {
const [editingId, setEditingId] =
useState(null);
const [form, setForm] = useState(null);
function startEdit(row) {
setEditingId(row.id);
setForm({
complaint_text: row.complaint_text ||
'',
vehicle_location:
row.vehicle_location ||
VEHICLE_LOCATION_OPTIONS[0],
remarks: row.remarks || '',
complaint_date: row.complaint_date ||
getTodayString(),
completed_date: row.completed_date ||
'',
status: row.status,
});
}
function cancelEdit() {
setEditingId(null); setForm(null); }
async function saveEdit(id) {
const patch = { ...form };
if (patch.status === 'Pending')
patch.completed_date = null;
if (patch.status === 'Completed' &&
!patch.completed_date) patch.completed_date
= getTodayString();
await onEdit(id, patch);
setEditingId(null); setForm(null);
}
const isPending = variant === 'pending';
const colCount = isPending ? 9 : 8;
return (
<div className="reportTableWrapper">
<table className="reportTable">
<thead>
<tr>
<th>#</th><th>Vehicle</th>
<th>Driver</th><th
className="reportComplaintCell">Complaint</
th>
<th>Vehicle Location</th>
<th>Complaint Date</th>
{!isPending && <th>Completed
Date</th>}
<th>Days</th><th>Remarks</th>
<th>{isPending ? 'Mark
Completed' : 'Edit'}</th>
</tr>
</thead>
<tbody>
{rows.length === 0 && (
<tr><td colSpan={colCount}
style={{ textAlign: 'center', padding:
'24px', color: 'var(--slate-500)' }}>
{isPending ? 'No pending
complaints 🎉' : 'No completed complaints
yet'}
</td></tr>
)}
{rows.map((r, i) => editingId ===
r.id ? (
<tr key={r.id}>
<td colSpan={colCount}>
<div
className="editRowForm">
<div
className="dateField">
<label
className="fieldLabel">Complaint</label>
<textarea rows={2}
value={form.complaint_text} onChange={(e)
=> setForm({ ...form, complaint_text:
e.target.value })} />
</div>
<div
className="editRowGrid">
<div
className="dateField">
<label
className="fieldLabel">Vehicle
Location</label>
<select value=
{form.vehicle_location} onChange={(e) =>
setForm({ ...form, vehicle_location:
e.target.value })}>
{VEHICLE_LOCATION_OPTIONS.map((opt) =>
<option key={opt} value={opt}>{opt}
</option>)}
</select>
</div>
<div
className="dateField">
<label
className="fieldLabel">Status</label>
<select value=
{form.status} onChange={(e) => setForm({
...form, status: e.target.value })}>
<option
value="Pending">Pending</option>
<option
value="Completed">Completed</option>
</select>
</div>
<div
className="dateField">
<label
className="fieldLabel">Complaint
Date</label>
<input type="date"
value={form.complaint_date} onChange={(e)
=> setForm({ ...form, complaint_date:
e.target.value })} />
</div>
{form.status ===
'Completed' && (
<div
className="dateField">
<label
className="fieldLabel">Completed
Date</label>
<input type="date"
value={form.completed_date ||
getTodayString()} onChange={(e) =>
setForm({ ...form, completed_date:
e.target.value })} />
</div>
)}
</div>
<div
className="dateField">
<label
className="fieldLabel">Remarks</label>
<textarea rows={2}
value={form.remarks} onChange={(e) =>
setForm({ ...form, remarks: e.target.value
})} placeholder="Optional notes" />
</div>
<div
className="completeRow">
<button
className="completeButton" onClick={() =>
saveEdit(r.id)}>✓ Save</button>
<button
className="deleteComplaint
locationCancelBtn" onClick={cancelEdit}>✕
Cancel</button>
</div>
</div>
</td>
</tr>
) : (
<tr key={r.id}>
<td>{i + 1}</td>
<td>{r.vehicles?.plate_no ||
'-'}</td>
<td>{driverLabel(r)}</td>
<td
className="reportComplaintCell">
{r.complaint_text}</td>
<td>{r.vehicle_location || '-
'}</td>
<td>
{formatDMY(r.complaint_date)}</td>
{!isPending && <td>
{formatDMY(r.completed_date)}</td>}
<td>
{daysBetween(r.complaint_date, isPending ?
null : r.completed_date)}</td>
<td
className="reportComplaintCell">{r.remarks
|| '-'}</td>
<td>
{isPending ? (
<div
className="markCompleteCell">
<input type="date"
value={completedDates[r.id] ||
getTodayString()} onChange={(e) =>
onCompletedDateChange(r.id,
e.target.value)} />
<button
className="completeButton" onClick={() =>
onMarkComplete(r.id)}>✓ Complete</button>
<button
className="btnPrimary editSmallBtn"
onClick={() => startEdit(r)}>✏️
Edit</button>
</div>
) : (
<button
className="btnPrimary editSmallBtn"
onClick={() => startEdit(r)}>✏️
Edit</button>
)}
</td>
</tr>
))}
</tbody>
</table>
</div>
);
}
/*
===========================================
==========
MANAGE USERS (admin-only)
===========================================
========== */
function AdminUserManager({ onBack,
currentUser }) {
const [users, setUsers] = useState([]);
const [loading, setLoading] =
useState(true);
const [message, setMessage] =
useState('');
const [username, setUsername] =
useState('');
const [password, setPassword] =
useState('');
const [name, setName] = useState('');
const [role, setRole] =
useState('driver');
const [gsNo, setGsNo] = useState('');
const [saving, setSaving] =
useState(false);
const [editingId, setEditingId] =
useState(null);
const [editName, setEditName] =
useState('');
const [editRole, setEditRole] =
useState('driver');
const [editGsNo, setEditGsNo] =
useState('');
const [editPassword, setEditPassword] =
useState('');
const load = useCallback(async () => {
setLoading(true); setMessage('');
const { data, error } = await
supabase.from('users').select('*').order('u
sername', { ascending: true });
if (error) { setMessage('Load failed: '
+ error.message); setLoading(false);
return; }
setUsers(data || []);
setLoading(false);
}, []);
useEffect(() => { load(); }, [load]);
async function addUser() {
if (!username.trim() ||
!password.trim() || !name.trim()) {
setMessage('Username, password, and name
are all required.'); return; }
if (role === 'driver' && !gsNo.trim())
{ setMessage('GS No is required for driver
accounts.'); return; }
setSaving(true);
const { error } = await
supabase.from('users').insert({
username: username.trim(), password:
password.trim(), name: name.trim(),
role, gs_no: role === 'driver' ?
gsNo.trim() : null,
});
setSaving(false);
if (error) {
setMessage(error.message.includes('duplicat
e') ? 'That username already exists.' :
'Save failed: ' + error.message); return; }
setUsername(''); setPassword('');
setName(''); setGsNo('');
setRole('driver');
load();
}
function startEdit(u) {
setEditingId(u.id);
setEditName(u.name); setEditRole(u.role);
setEditGsNo(u.gs_no || '');
setEditPassword('');
}
function cancelEdit() {
setEditingId(null); }
async function saveEdit(id) {
const patch = { name: editName.trim(),
role: editRole, gs_no: editRole ===
'driver' ? editGsNo.trim() : null };
if (editPassword.trim()) patch.password
= editPassword.trim();
const { error } = await
supabase.from('users').update(patch).eq('id
', id);
if (error) { setMessage('Update failed:
' + error.message); return; }
setEditingId(null);
load();
}
async function deleteUser(u) {
if (u.id === currentUser.id) {
setMessage("You can't delete the account
you're signed in with."); return; }
const { error } = await
supabase.from('users').delete().eq('id',
u.id);
if (error) { setMessage('Delete failed:
' + error.message); return; }
load();
}
return (
<>
<div className="reportTopBar
noPrint">
<button
className="reportBackButton" onClick=
{onBack}>← Back to Dashboard</button>
</div>
<section className="card">
<div className="sectionTitle">
<span className="iconCircle
iconIndigo">👥</span>
<div><h2>Manage Users</h2>
<p>Create admin or driver accounts without
touching Supabase</p></div>
</div>
<div className="dateField">
<label
className="fieldLabel">Username</label>
<input value={username} onChange=
{(e) => setUsername(e.target.value)}
placeholder="e.g. driver12" />
</div>
<div className="dateField">
<label
className="fieldLabel">Temporary
Password</label>
<PasswordInput value={password}
onChange={(e) =>
setPassword(e.target.value)}
placeholder="They should change this after
first login" />
</div>
<div className="dateField">
<label
className="fieldLabel">Full Name</label>
<input value={name} onChange={(e)
=> setName(e.target.value)} />
</div>
<div className="dateField">
<label
className="fieldLabel">Role</label>
<select value={role} onChange=
{(e) => setRole(e.target.value)}>
<option
value="driver">Driver</option>
<option
value="admin">Admin</option>
</select>
</div>
{role === 'driver' && (
<div className="dateField">
<label
className="fieldLabel">GS No (must match an
employees.gs_no)</label>
<input value={gsNo} onChange=
{(e) => setGsNo(e.target.value)}
placeholder="e.g. GS1023" />
</div>
)}
<button className="submitButton"
onClick={addUser} disabled={saving}>
{saving ? <span
className="spinner light" /> : '＋ Add
User'}
</button>
{message && <div
className="errorMessage">⚠ {message}
</div>}
</section>
<section className="card">
<div className="adminSectionTitle">
<span>👥 Users</span><span
className="countBadge pendingCount">
{users.length}</span></div>
{loading && <p
className="loadingText">Loading...</p>}
{!loading && users.map((u) => (
<div className="adminComplaint"
key={u.id}>
{editingId === u.id ? (
<>
<div className="dateField">
<label className="fieldLabel">Full
Name</label><input value={editName}
onChange={(e) =>
setEditName(e.target.value)} /></div>
<div className="dateField">
<label
className="fieldLabel">Role</label>
<select value={editRole}
onChange={(e) =>
setEditRole(e.target.value)}>
<option
value="driver">Driver</option><option
value="admin">Admin</option>
</select>
</div>
{editRole === 'driver' && (
<div
className="dateField"><label
className="fieldLabel">GS No</label><input
value={editGsNo} onChange={(e) =>
setEditGsNo(e.target.value)} /></div>
)}
<div className="dateField">
<label className="fieldLabel">Reset
Password (leave blank to keep current)
</label><PasswordInput value={editPassword}
onChange={(e) =>
setEditPassword(e.target.value)} /></div>
<div
className="completeRow">
<button
className="completeButton" onClick={() =>
saveEdit(u.id)}>✓ Save</button>
<button
className="deleteComplaint
locationCancelBtn" onClick={cancelEdit}>✕
Cancel</button>
</div>
</>
) : (
<>
<div
className="adminComplaintTop"><strong>
{u.name}</strong><span className={u.role
=== 'admin' ? 'badge completedBadge' :
'badge pendingBadge'}>
{u.role.toUpperCase()}</span></div>
<div
className="adminInfoGrid">
<div
className="adminInfo"><span>Username</span>
<strong>{u.username}</strong></div>
<div
className="adminInfo"><span>GS No</span>
<strong>{u.gs_no || '-'}</strong></div>
</div>
<div
className="completeRow">
<button
className="btnPrimary" onClick={() =>
startEdit(u)}>Edit</button>
<button
className="deleteComplaint
locationCancelBtn" onClick={() =>
deleteUser(u)}>Delete</button>
</div>
</>
)}
</div>
))}
</section>
</>
);
}
/*
===========================================
==========
ADMIN DASHBOARD
===========================================
========== */
function AdminDashboard({
complaints, adminSearch, setAdminSearch,
refreshing, message,
completedDates, handleCompletedDate,
completeComplaint, onEditComplaint,
onOpenReport, onOpenLocations,
onOpenUsers, onRefresh,
}) {
const searchValue =
adminSearch.trim().toLowerCase();
const visible = useMemo(() => {
if (!searchValue) return complaints;
return complaints.filter((item) => {
const plate =
item.vehicles?.plate_no?.toString().toLower
Case() || '';
const asset =
item.vehicles?.asset_no?.toString().toLower
Case() || '';
return plate.includes(searchValue) ||
asset.includes(searchValue);
});
}, [complaints, searchValue]);
const pending = useMemo(() =>
visible.filter((c) => c.status ===
'Pending'), [visible]);
const completed = useMemo(() =>
visible.filter((c) => c.status ===
'Completed'), [visible]);
const total = visible.length;
const averageRepairDays = useMemo(() => {
const durations = completed.map((c) =>
daysBetween(c.complaint_date,
c.completed_date));
if (!durations.length) return 0;
return Math.round(durations.reduce((s,
d) => s + d, 0) / durations.length);
}, [completed]);
return (
<>
<section className="adminDashboard">
<div className="dashboardHeader">
<div><h2>SPIC DRIVE</h2>
<p>Complaint Overview</p></div>
<div className="dashboardIcon">📊
</div>
</div>
<div className="dashboardGrid">
<div className="dashboardCard">
<span className="dot dotRed" /><div>
<span>Pending</span><strong>
{pending.length}</strong></div></div>
<div className="dashboardCard">
<span className="dot dotGreen" /><div>
<span>Completed</span><strong>
{completed.length}</strong></div></div>
<div className="dashboardCard">
<span className="dot dotGold" /><div>
<span>Total</span><strong>{total}</strong>
</div></div>
<div className="dashboardCard">
<span className="dot dotIndigo" /><div>
<span>Avg. Repair</span><strong>
{averageRepairDays}d</strong></div></div>
</div>
<div className="dashboardCtaRow">
<button
className="reportCtaButton" onClick=
{onOpenReport}>📋 Open Full Report</button>
<button
className="reportCtaButton" onClick=
{onOpenLocations}>📍 Manage
Locations</button>
<button
className="reportCtaButton" onClick=
{onOpenUsers}>👥 Manage Users</button>
</div>
</section>
<section className="card">
<div className="sectionTitle">
<span className="iconCircle
iconIndigo">👨‍💼</span>
<div><h2>Complaint
Management</h2><p>Pending &amp; completed
complaints</p></div>
</div>
<div className="searchRow">
<input type="text" value=
{adminSearch} onChange={(e) =>
setAdminSearch(e.target.value)}
placeholder="Filter by Plate No / Asset No"
autoComplete="off" />
<button className="btnPrimary"
onClick={onRefresh}>{refreshing ? <span
className="spinner" /> : 'Refresh'}
</button>
</div>
{message && <div
className="saveMessage fadeIn">{message}
</div>}
</section>
<section className="card">
<div className="adminSectionTitle">
<span>🔴 Pending</span><span
className="countBadge pendingCount">
{pending.length}</span></div>
{refreshing && <p
className="loadingText">Loading
complaints...</p>}
{!refreshing && (
<AdminComplaintsTable
variant="pending" rows=
{pending}
completedDates={completedDates}
onCompletedDateChange={handleCompletedDate}
onMarkComplete=
{completeComplaint} onEdit=
{onEditComplaint}
/>
)}
</section>
<section className="card">
<div className="adminSectionTitle">
<span>🟢 Completed</span><span
className="countBadge completedCount">
{completed.length}</span></div>
<AdminComplaintsTable
variant="completed" rows={completed}
onEdit={onEditComplaint} />
</section>
</>
);
}
/*
===========================================
==========
MAIN APP
===========================================
========== */
function App() {
// currentUser is persisted to
localStorage on login and rehydrated on
// mount, so the app stays signed in
across reloads/backgrounding. Only
// explicitly clicking Sign Out clears
it.
const [currentUser, setCurrentUser] =
useState(loadStoredUser);
const [mode, setMode] =
useState('admin');
const [showPasswordPanel,
setShowPasswordPanel] = useState(false);
const [complaints, setComplaints] =
useState([]);
const [complaintsLoading,
setComplaintsLoading] = useState(false);
const [message, setMessage] =
useState('');
const [adminSearch, setAdminSearch] =
useState('');
const [completedDates, setCompletedDates]
= useState({});
const [adminView, setAdminView] =
useState('dashboard'); // 'dashboard' |
'report' | 'locations' | 'users'
function login(user) { storeUser(user);
setCurrentUser(user); }
function signOut() { storeUser(null);
setCurrentUser(null);
setAdminView('dashboard');
setShowPasswordPanel(false); }
function
onCredentialsUpdated(updatedUser) {
const merged = { ...currentUser,
...updatedUser };
storeUser(merged);
setCurrentUser(merged);
}
const fetchComplaints = useCallback(async
() => {
setMessage('');
setComplaintsLoading(true);
const { data: complaintsData, error:
complaintsError } = await supabase
.from('complaint_records').select('*').orde
r('complaint_date', { ascending: false });
if (complaintsError) {
setComplaintsLoading(false);
setComplaints([]);
setMessage('Load failed: ' +
complaintsError.message);
return;
}
const vehicleIds = [...new
Set((complaintsData || []).map((i) =>
i.vehicle_id).filter(Boolean))];
const employeeIds = [...new
Set((complaintsData || []).map((i) =>
i.employee_id).filter(Boolean))];
let vehiclesMap = new Map(),
employeesMap = new Map();
if (vehicleIds.length > 0) {
const { data, error } = await
supabase.from('vehicles').select('*').in('i
d', vehicleIds);
if (error) {
setComplaintsLoading(false);
setMessage('Vehicle load failed: ' +
error.message); return; }
vehiclesMap = toMap(data);
}
if (employeeIds.length > 0) {
const { data, error } = await
supabase.from('employees').select('*').in('
id', employeeIds);
if (error) {
setComplaintsLoading(false);
setMessage('Employee load failed: ' +
error.message); return; }
employeesMap = toMap(data);
}
const finalData = (complaintsData ||
[]).map((c) => ({
...c,
vehicles:
vehiclesMap.get(c.vehicle_id) || null,
employees:
employeesMap.get(c.employee_id) || null,
}));
setComplaints(finalData);
setComplaintsLoading(false);
}, []);
useEffect(() => {
if (currentUser) fetchComplaints();
}, [currentUser, fetchComplaints]);
const completeComplaint =
useCallback(async (id) => {
const date = completedDates[id] ||
getTodayString();
const { error } = await
supabase.from('complaint_records').update({
status: 'Completed', completed_date: date
}).eq('id', id);
if (error) { setMessage('Update failed:
' + error.message); return; }
setMessage('✓ Complaint completed
successfully.');
fetchComplaints();
}, [completedDates, fetchComplaints]);
// Generic admin edit — can change the
complaint text, vehicle location,
// remarks, dates, and even flip status
back to Pending to correct a
// mistaken "Mark Completed".
const editComplaint = useCallback(async
(id, patch) => {
const { error } = await
supabase.from('complaint_records').update(p
atch).eq('id', id);
if (error) { setMessage('Edit failed: '
+ error.message); return; }
setMessage('✓ Complaint updated.');
fetchComplaints();
}, [fetchComplaints]);
function handleCompletedDate(id, date) {
setCompletedDates((prev) => ({ ...prev,
[id]: date })); }
if (!currentUser) return <LoginScreen
onLogin={login} />;
return (
<div className="app">
<header className="header">
<div className="brandRow">
<div className="logoBadge"><img
src={LOGO_URL} alt="SPIC DRIVE logo"
className="logoImg" /></div>
<div><div className="logo">SPIC
DRIVE</div><div
className="headerSub">Vehicle Service
System</div></div>
</div>
<button className="logoutButton"
onClick={signOut} title="Sign out">􀀀 Sign
Out</button>
</header>
<div className="roleBar">
<span className="roleChip">🛡
{currentUser.name} · {currentUser.role ===
'admin' ? 'Administrator' : 'Driver'}
</span>
<button
className="passwordToggleBtn" onClick={()
=> setShowPasswordPanel((v) => !v)}>🔑
Password</button>
</div>
{showPasswordPanel && (
<div className="container" style={{
paddingTop: 14, paddingBottom: 0 }}>
<ChangePasswordPanel currentUser=
{currentUser} onClose={() =>
setShowPasswordPanel(false)} onUpdated=
{onCredentialsUpdated} />
</div>
)}
{currentUser.role === 'admin' && (
<div className="modeSwitch">
<button className={mode ===
'driver' ? 'modeButton activeMode' :
'modeButton'} onClick={() =>
setMode('driver')}>👤 Driver</button>
<button className={mode ===
'admin' ? 'modeButton activeMode' :
'modeButton'} onClick={() =>
setMode('admin')}>👨‍💼 Admin</button>
</div>
)}
<main className="container">
{currentUser.role === 'driver' ||
mode === 'driver' ? (
<DriverExperience
currentUser={currentUser}
complaints={complaints} complaintsLoading=
{complaintsLoading}
complaintsMessage={message}
onRefresh={fetchComplaints}
/>
) : adminView === 'report' ? (
<ReportView complaints=
{complaints} loading={complaintsLoading}
message={message} showBack onBack={() =>
setAdminView('dashboard')} />
) : adminView === 'locations' ? (
<LocationManager onBack={() =>
setAdminView('dashboard')} />
) : adminView === 'users' ? (
<AdminUserManager onBack={() =>
setAdminView('dashboard')} currentUser=
{currentUser} />
) : (
<AdminDashboard
complaints={complaints}
adminSearch={adminSearch} setAdminSearch=
{setAdminSearch}
refreshing={complaintsLoading}
message={message}
completedDates={completedDates}
handleCompletedDate={handleCompletedDate}
completeComplaint=
{completeComplaint} onEditComplaint=
{editComplaint}
onOpenReport={() =>
setAdminView('report')} onOpenLocations={()
=> setAdminView('locations')}
onOpenUsers={() =>
setAdminView('users')} onRefresh=
{fetchComplaints}
/>
)}
</main>
<footer>SPIC DRIVE • Enterprise
Workshop Management</footer>
</div>
);
}
export default App;
