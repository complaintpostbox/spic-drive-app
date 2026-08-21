import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import './App.css';

/* =====================================================
   DRIVER SCREEN  (top-level component — never remounts)
===================================================== */
function DriverScreen({
  gsNo, setGsNo, employee, employeeMessage, employeeLoading, findEmployee,
  vehicleNo, setVehicleNo, vehicle, vehicleMessage, vehicleLoading, findVehicle,
  complaints, updateComplaint, addComplaint, removeComplaint,
  submitComplaints, saving, saveMessage,
}) {
  return (
    <>
      {/* DRIVER IDENTITY */}
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
            <div className="verified">
              <span className="checkBadge">✓</span> Verified Employee
            </div>
            <div className="infoGrid">
              <div className="infoRow">
                <span>Name</span>
                <strong>{employee.name || '-'}</strong>
              </div>
              <div className="infoRow">
                <span>Designation</span>
                <strong>{employee.designation || '-'}</strong>
              </div>
              <div className="infoRow">
                <span>Phone</span>
                <strong>{employee.phone || '-'}</strong>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* VEHICLE */}
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
            <div className="verified">
              <span className="checkBadge">✓</span> Vehicle Found
            </div>
            <div className="vehicleMain">
              <strong>{vehicle.plate_no || '-'}</strong>
              <span>{vehicle.equipment_description || '-'}</span>
            </div>
            <div className="infoGrid">
              <div className="infoRow">
                <span>Asset No</span>
                <strong>{vehicle.asset_no || '-'}</strong>
              </div>
              <div className="infoRow">
                <span>Make / Model</span>
                <strong>{vehicle.make || '-'} / {vehicle.model || '-'}</strong>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* COMPLAINTS */}
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
                <button className="deleteComplaint" onClick={() => removeComplaint(index)}>
                  ✕
                </button>
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

        <button className="addComplaintButton" onClick={addComplaint}>
          ＋ Add Another Complaint
        </button>

        <button className="submitButton" onClick={submitComplaints} disabled={saving}>
          {saving ? <span className="spinner light" /> : 'SUBMIT COMPLAINT'}
        </button>

        {saveMessage && <div className="saveMessage fadeIn">{saveMessage}</div>}
      </section>
    </>
  );
}

/* =====================================================
   ADMIN SCREEN  (top-level component — never remounts)
===================================================== */
function AdminScreen({
  adminSearch, setAdminSearch, loadAdminComplaints, adminLoading, adminMessage,
  pending, completed, total, averageRepairDays,
  calculateDays, completedDates, handleCompletedDate, getToday, completeComplaint,
  onOpenReport,
}) {
  return (
    <>
      {/* DASHBOARD */}
      <section className="adminDashboard">
        <div className="dashboardHeader">
          <div>
            <h2>SPIC DRIVE</h2>
            <p>Complaint Overview</p>
          </div>
          <div className="dashboardIcon">📊</div>
        </div>

        <div className="dashboardGrid">
          <div className="dashboardCard pendingDashboard">
            <div className="dashboardCardIcon">🔴</div>
            <div>
              <span>Pending</span>
              <strong>{pending.length}</strong>
            </div>
          </div>
          <div className="dashboardCard completedDashboard">
            <div className="dashboardCardIcon">🟢</div>
            <div>
              <span>Completed</span>
              <strong>{completed.length}</strong>
            </div>
          </div>
          <div className="dashboardCard totalDashboard">
            <div className="dashboardCardIcon">📋</div>
            <div>
              <span>Total</span>
              <strong>{total}</strong>
            </div>
          </div>
          <div className="dashboardCard repairDashboard">
            <div className="dashboardCardIcon">⏱️</div>
            <div>
              <span>Avg. Repair</span>
              <strong>{averageRepairDays} Days</strong>
            </div>
          </div>
        </div>

        {/* NEW: entry point into the full Admin Report */}
        <button className="reportCtaButton" onClick={onOpenReport}>
          📄 VIEW / DOWNLOAD REPORT
        </button>
      </section>

      {/* SEARCH */}
      <section className="card">
        <div className="sectionTitle">
          <span className="iconCircle iconBlue">👨‍💼</span>
          <div>
            <h2>Complaint Management</h2>
            <p>Pending & completed complaints</p>
          </div>
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

      {/* PENDING */}
      <section className="card">
        <div className="adminSectionTitle">
          <span>🔴 Pending</span>
          <span className="countBadge pendingCount">{pending.length}</span>
        </div>

        {adminLoading && <p className="loadingText">Loading complaints...</p>}
        {!adminLoading && pending.length === 0 && (
          <div className="emptyState">No pending complaints 🎉</div>
        )}

        {pending.map((complaint) => (
          <div className="adminComplaint" key={complaint.id}>
            <div className="adminComplaintTop">
              <strong>{complaint.complaint_text}</strong>
              <span className="badge pendingBadge">PENDING</span>
            </div>

            <div className="adminInfoGrid">
              <div className="adminInfo">
                <span>Vehicle</span>
                <strong>{complaint.vehicles?.plate_no || '-'}</strong>
              </div>
              <div className="adminInfo">
                <span>Driver</span>
                <strong>{complaint.employees?.name || '-'}</strong>
              </div>
              <div className="adminInfo">
                <span>Complaint Date</span>
                <strong>{complaint.complaint_date}</strong>
              </div>
            </div>

            <div className="daysBox">
              ⏳ Pending for <strong>{calculateDays(complaint)} Days</strong>
            </div>

            <div className="completeRow">
              <input
                type="date"
                value={completedDates[complaint.id] || getToday()}
                onChange={(e) => handleCompletedDate(complaint.id, e.target.value)}
              />
              <button className="completeButton" onClick={() => completeComplaint(complaint.id)}>
                ✓ Mark Completed
              </button>
            </div>
          </div>
        ))}
      </section>

      {/* COMPLETED */}
      <section className="card">
        <div className="adminSectionTitle">
          <span>🟢 Completed</span>
          <span className="countBadge completedCount">{completed.length}</span>
        </div>

        {completed.length === 0 && (
          <div className="emptyState">No completed complaints yet</div>
        )}

        {completed.map((complaint) => (
          <div className="adminComplaint completedCard" key={complaint.id}>
            <div className="adminComplaintTop">
              <strong>{complaint.complaint_text}</strong>
              <span className="badge completedBadge">COMPLETED</span>
            </div>

            <div className="adminInfoGrid">
              <div className="adminInfo">
                <span>Vehicle</span>
                <strong>{complaint.vehicles?.plate_no || '-'}</strong>
              </div>
              <div className="adminInfo">
                <span>Complaint Date</span>
                <strong>{complaint.complaint_date}</strong>
              </div>
              <div className="adminInfo">
                <span>Completed Date</span>
                <strong>{complaint.completed_date}</strong>
              </div>
            </div>

            <div className="daysBox completedDays">
              ✓ Repair Duration: <strong>{calculateDays(complaint)} Days</strong>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

/* =====================================================
   ADMIN REPORT SCREEN  (NEW — top-level component, never remounts)
   Reads from the full adminComplaints list (not the dashboard's
   already-filtered visibleComplaints) so the report always covers
   every record, with its own independent filter box.
===================================================== */
function AdminReport({ allComplaints, calculateDays, getToday, onBack }) {
  const [reportSearch, setReportSearch] = useState('');

  const searchValue = reportSearch.trim().toLowerCase();
  const rows = searchValue
    ? allComplaints.filter((item) => {
        const plate = item.vehicles?.plate_no?.toString().toLowerCase() || '';
        const asset = item.vehicles?.asset_no?.toString().toLowerCase() || '';
        return plate.includes(searchValue) || asset.includes(searchValue);
      })
    : allComplaints;

  const reportPending = rows.filter((c) => c.status === 'Pending');
  const reportCompleted = rows.filter((c) => c.status === 'Completed');
  const reportTotal = rows.length;

  const durations = reportCompleted.map((c) => calculateDays(c));
  const reportAvgRepair =
    durations.length > 0
      ? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length)
      : 0;

  function escapeCsv(value) {
    const str = value === null || value === undefined ? '' : String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function handleExportCsv() {
    const headers = [
      'Employee', 'Plate No', 'Asset No', 'Complaint',
      'Complaint Date', 'Status', 'Completed Date', 'Repair Duration (Days)',
    ];

    const csvRows = rows.map((c) => [
      escapeCsv(c.employees?.name || '-'),
      escapeCsv(c.vehicles?.plate_no || '-'),
      escapeCsv(c.vehicles?.asset_no || '-'),
      escapeCsv(c.complaint_text || '-'),
      escapeCsv(c.complaint_date || '-'),
      escapeCsv(c.status || '-'),
      escapeCsv(c.completed_date || '-'),
      escapeCsv(calculateDays(c)),
    ]);

    const csvContent = [headers.join(','), ...csvRows.map((r) => r.join(','))].join('\n');
    // BOM so Excel opens UTF-8 CSVs correctly
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `SpicDrive_Report_${getToday()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handlePrint() {
    window.print();
  }

  return (
    <>
      <div className="reportTopBar noPrint">
        <button className="reportBackButton" onClick={onBack}>
          ← Back to Admin
        </button>
      </div>

      <div id="reportPrintArea">
        <section className="card">
          <div className="sectionTitle">
            <span className="iconCircle iconBlue">📄</span>
            <div>
              <h2>Complaint Report</h2>
              <p>Full workshop complaint history</p>
            </div>
          </div>

          <div className="reportStatsGrid">
            <div className="reportStatCard reportStatPending">
              <span>Pending</span>
              <strong>{reportPending.length}</strong>
            </div>
            <div className="reportStatCard reportStatCompleted">
              <span>Completed</span>
              <strong>{reportCompleted.length}</strong>
            </div>
            <div className="reportStatCard reportStatTotal">
              <span>Total</span>
              <strong>{reportTotal}</strong>
            </div>
            <div className="reportStatCard reportStatAvg">
              <span>Avg. Repair</span>
              <strong>{reportAvgRepair} Days</strong>
            </div>
          </div>

          <div className="searchRow reportSearchRow noPrint">
            <input
              type="text"
              value={reportSearch}
              onChange={(e) => setReportSearch(e.target.value)}
              placeholder="Filter by Plate No / Asset No"
              autoComplete="off"
            />
          </div>

          <div className="reportActionsRow noPrint">
            <button className="exportCsvButton" onClick={handleExportCsv}>
              ⬇ Export CSV
            </button>
            <button className="printReportButton" onClick={handlePrint}>
              🖨 Print / Save PDF
            </button>
          </div>

          <div className="reportTableWrapper">
            {rows.length === 0 ? (
              <div className="emptyState">No complaints match this filter</div>
            ) : (
              <table className="reportTable">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Plate No</th>
                    <th>Asset No</th>
                    <th>Complaint</th>
                    <th>Complaint Date</th>
                    <th>Status</th>
                    <th>Completed Date</th>
                    <th>Repair Days</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td>{c.employees?.name || '-'}</td>
                      <td>{c.vehicles?.plate_no || '-'}</td>
                      <td>{c.vehicles?.asset_no || '-'}</td>
                      <td className="reportComplaintCell">{c.complaint_text}</td>
                      <td>{c.complaint_date || '-'}</td>
                      <td>
                        <span className={c.status === 'Completed' ? 'badge completedBadge' : 'badge pendingBadge'}>
                          {c.status === 'Completed' ? 'COMPLETED' : 'PENDING'}
                        </span>
                      </td>
                      <td>{c.completed_date || '-'}</td>
                      <td>{calculateDays(c)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

/* =====================================================
   MAIN APP
===================================================== */
function App() {
  const [mode, setMode] = useState('driver');

  // NEW: whether the Admin Report screen is open
  const [showReport, setShowReport] = useState(false);

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
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // ADMIN STATE
  const [adminSearch, setAdminSearch] = useState('');
  const [adminComplaints, setAdminComplaints] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminMessage, setAdminMessage] = useState('');
  const [completedDates, setCompletedDates] = useState({});

  // -------- DRIVER FUNCTIONS --------
  async function findEmployee() {
    if (!gsNo.trim()) {
      setEmployee(null);
      setEmployeeMessage('Please enter GS No');
      return;
    }
    setEmployeeLoading(true);
    setEmployeeMessage('');

    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('gs_no', gsNo.trim())
      .maybeSingle();

    setEmployeeLoading(false);

    if (error) {
      setEmployee(null);
      setEmployeeMessage(error.message);
      return;
    }
    if (!data) {
      setEmployee(null);
      setEmployeeMessage('Employee not found');
      return;
    }
    setEmployee(data);
  }

  async function findVehicle() {
    if (!vehicleNo.trim()) {
      setVehicle(null);
      setVehicleMessage('Please enter Plate No or Asset No');
      return;
    }
    setVehicleLoading(true);
    setVehicleMessage('');

    const value = vehicleNo.trim();

    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .or(`plate_no.eq.${value},asset_no.eq.${value}`)
      .limit(1)
      .maybeSingle();

    setVehicleLoading(false);

    if (error) {
      setVehicle(null);
      setVehicleMessage(error.message);
      return;
    }
    if (!data) {
      setVehicle(null);
      setVehicleMessage('Vehicle not found');
      return;
    }
    setVehicle(data);
  }

  function addComplaint() {
    setComplaints([...complaints, '']);
  }

  function updateComplaint(index, value) {
    const updated = [...complaints];
    updated[index] = value;
    setComplaints(updated);
  }

  function removeComplaint(index) {
    if (complaints.length === 1) return;
    setComplaints(complaints.filter((_, i) => i !== index));
  }

  async function submitComplaints() {
    setSaveMessage('');

    if (!employee) {
      setSaveMessage('Please search and select an employee first.');
      return;
    }
    if (!vehicle) {
      setSaveMessage('Please search and select a vehicle first.');
      return;
    }

    const validComplaints = complaints
      .map((text) => text.trim())
      .filter((text) => text !== '');

    if (validComplaints.length === 0) {
      setSaveMessage('Please enter at least one complaint.');
      return;
    }

    setSaving(true);

    const records = validComplaints.map((text) => ({
      employee_id: employee.id,
      vehicle_id: vehicle.id,
      complaint_text: text,
      status: 'Pending',
    }));

    const { error } = await supabase.from('complaint_records').insert(records);

    setSaving(false);

    if (error) {
      setSaveMessage('Save failed: ' + error.message);
      return;
    }

    setSaveMessage(`✓ ${validComplaints.length} complaint(s) submitted successfully.`);
    setComplaints(['']);
  }

  // -------- ADMIN FUNCTIONS --------
  // Fetches the FULL complaint list once. Filtering by the search box is done
  // locally in `visibleComplaints` below (useMemo-free derived value), so the
  // input never triggers a network request / re-fetch while typing — this is
  // what fixes the "typing lock" / focus-loss bug.
  async function loadAdminComplaints() {
    setAdminMessage('');
    setAdminLoading(true);

    const { data: complaintsData, error: complaintsError } = await supabase
      .from('complaint_records')
      .select('*')
      .order('complaint_date', { ascending: false });

    if (complaintsError) {
      setAdminLoading(false);
      setAdminComplaints([]);
      setAdminMessage('Load failed: ' + complaintsError.message);
      return;
    }

    const vehicleIds = [...new Set((complaintsData || []).map((i) => i.vehicle_id).filter(Boolean))];
    const employeeIds = [...new Set((complaintsData || []).map((i) => i.employee_id).filter(Boolean))];

    let vehiclesData = [];
    let employeesData = [];

    if (vehicleIds.length > 0) {
      const { data, error } = await supabase.from('vehicles').select('*').in('id', vehicleIds);
      if (error) {
        setAdminLoading(false);
        setAdminMessage('Vehicle load failed: ' + error.message);
        return;
      }
      vehiclesData = data || [];
    }

    if (employeeIds.length > 0) {
      const { data, error } = await supabase.from('employees').select('*').in('id', employeeIds);
      if (error) {
        setAdminLoading(false);
        setAdminMessage('Employee load failed: ' + error.message);
        return;
      }
      employeesData = data || [];
    }

    const finalData = (complaintsData || []).map((complaint) => ({
      ...complaint,
      vehicles: vehiclesData.find((v) => v.id === complaint.vehicle_id) || null,
      employees: employeesData.find((e) => e.id === complaint.employee_id) || null,
    }));

    setAdminComplaints(finalData);
    setAdminLoading(false);
  }

  // Local, client-side filter — recalculated on every render but does NOT
  // cause a re-fetch or remount, so the search input keeps focus while typing.
  const searchValue = adminSearch.trim().toLowerCase();
  const visibleComplaints = searchValue
    ? adminComplaints.filter((item) => {
        const plate = item.vehicles?.plate_no?.toString().toLowerCase() || '';
        const asset = item.vehicles?.asset_no?.toString().toLowerCase() || '';
        return plate.includes(searchValue) || asset.includes(searchValue);
      })
    : adminComplaints;

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

  function getToday() {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  }

  async function completeComplaint(id) {
    const date = completedDates[id] || getToday();

    const { error } = await supabase
      .from('complaint_records')
      .update({ status: 'Completed', completed_date: date })
      .eq('id', id);

    if (error) {
      setAdminMessage('Update failed: ' + error.message);
      return;
    }

    setAdminMessage('✓ Complaint completed successfully.');
    loadAdminComplaints();
  }

  function handleCompletedDate(id, date) {
    setCompletedDates({ ...completedDates, [id]: date });
  }

  useEffect(() => {
    if (mode === 'admin') {
      loadAdminComplaints();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const pending = visibleComplaints.filter((c) => c.status === 'Pending');
  const completed = visibleComplaints.filter((c) => c.status === 'Completed');
  const total = visibleComplaints.length;

  const completedDurations = completed.map((c) => calculateDays(c));
  const averageRepairDays =
    completedDurations.length > 0
      ? Math.round(completedDurations.reduce((sum, d) => sum + d, 0) / completedDurations.length)
      : 0;

  // If the user switches out of Admin mode, close the report view too.
  useEffect(() => {
    if (mode !== 'admin' && showReport) {
      setShowReport(false);
    }
  }, [mode, showReport]);

  return (
    <div className="app">
      <header className="header noPrint">
        <div>
          <div className="logo">SPIC DRIVE</div>
          <div className="headerSub">Vehicle Service System</div>
        </div>
        <div className="headerIcon">🚗</div>
      </header>

      <div className="modeSwitch noPrint">
        <button
          className={mode === 'driver' ? 'modeButton activeMode' : 'modeButton'}
          onClick={() => setMode('driver')}
        >
          👤 Driver
        </button>
        <button
          className={mode === 'admin' ? 'modeButton activeMode' : 'modeButton'}
          onClick={() => setMode('admin')}
        >
          👨‍💼 Admin
        </button>
      </div>

      <main className="container">
        {mode === 'driver' ? (
          <DriverScreen
            gsNo={gsNo} setGsNo={setGsNo} employee={employee}
            employeeMessage={employeeMessage} employeeLoading={employeeLoading} findEmployee={findEmployee}
            vehicleNo={vehicleNo} setVehicleNo={setVehicleNo} vehicle={vehicle}
            vehicleMessage={vehicleMessage} vehicleLoading={vehicleLoading} findVehicle={findVehicle}
            complaints={complaints} updateComplaint={updateComplaint}
            addComplaint={addComplaint} removeComplaint={removeComplaint}
            submitComplaints={submitComplaints} saving={saving} saveMessage={saveMessage}
          />
        ) : showReport ? (
          <AdminReport
            allComplaints={adminComplaints}
            calculateDays={calculateDays}
            getToday={getToday}
            onBack={() => setShowReport(false)}
          />
        ) : (
          <AdminScreen
            adminSearch={adminSearch} setAdminSearch={setAdminSearch}
            loadAdminComplaints={loadAdminComplaints} adminLoading={adminLoading} adminMessage={adminMessage}
            pending={pending} completed={completed} total={total} averageRepairDays={averageRepairDays}
            calculateDays={calculateDays} completedDates={completedDates}
            handleCompletedDate={handleCompletedDate} getToday={getToday} completeComplaint={completeComplaint}
            onOpenReport={() => setShowReport(true)}
          />
        )}
      </main>

      <footer className="noPrint">SPIC DRIVE • Vehicle Management System</footer>
    </div>
  );
}

export default App;
