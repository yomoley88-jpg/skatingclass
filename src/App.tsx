import { useEffect, useMemo, useState } from 'react'
import {
  createStudent,
  getActiveStudents,
  getAttendanceHistory,
  getStudent,
  getStudentHistory,
  markPaid,
  saveAttendance,
  signedProofUrl,
  type AttendanceRecord,
  type AttendanceSession,
  type Student,
  type StudentHistoryRecord,
} from './attendanceApi'

type View = 'attendance' | 'history' | 'students' | 'student'
type RowState = { present: boolean }

function today() {
  return new Date().toISOString().slice(0, 10)
}

function lessonBadge(count: number) {
  if (count >= 4) return { text: 'Payment Due', tone: 'danger' }
  if (count === 3) return { text: 'Ping Parent', tone: 'warn' }
  return { text: `${count}/4 lessons`, tone: 'neutral' }
}

function paymentStatus(count: number) {
  if (count >= 4) return 'Payment Due'
  if (count === 3) return 'Ping Parent'
  return `${count}/4 lessons`
}

function canRecordPayment(count: number) {
  return count > 0
}

function dateLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
}

function timeLabel(value: string) {
  return new Date(value).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function SignedImage({ path, label }: { path: string; label: string }) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    let mounted = true
    signedProofUrl(path)
      .then(result => { if (mounted) setUrl(result) })
      .catch(() => { if (mounted) setUrl('') })
    return () => { mounted = false }
  }, [path])

  if (!url) return <div className="proof-placeholder">Loading</div>
  return <img className="proof-image" src={url} alt={label} />
}

function AttendanceView({ onOpenStudent }: { onOpenStudent: (id: string) => void }) {
  const [students, setStudents] = useState<Student[]>([])
  const [sessions, setSessions] = useState<AttendanceSession[]>([])
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [classDate, setClassDate] = useState(today())
  const [classFiles, setClassFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    load().catch(err => setError(err.message ?? 'Could not load students.'))
  }, [])

  async function load() {
    setLoading(true)
    const [active, history] = await Promise.all([
      getActiveStudents(),
      getAttendanceHistory(),
    ])
    setStudents(active)
    setSessions(history)
    setRows(Object.fromEntries(active.map(student => [student.id, { present: false }])))
    setLoading(false)
  }

  const presentCount = useMemo(() => Object.values(rows).filter(row => row.present).length, [rows])

  function patchRow(id: string, patch: Partial<RowState>) {
    setRows(current => ({ ...current, [id]: { ...current[id], ...patch } }))
  }

  async function submit() {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await saveAttendance({
        classDate,
        classProofFiles: classFiles,
        rows: students.map(student => ({
          student,
          present: rows[student.id]?.present ?? false,
        })),
      })
      setClassFiles([])
      await load()
      setNotice('Attendance saved with private proof records.')
    } catch (err: any) {
      setError(err.message ?? 'Could not save attendance.')
    } finally {
      setSaving(false)
    }
  }

  async function paid(student: Student) {
    setError('')
    await markPaid(student.id)
    await load()
    setNotice(`${student.name} marked paid. Lesson count reset to 0.`)
  }

  return (
    <div className="stack">
      {notice && <div className="alert success">{notice}</div>}
      {error && <div className="alert danger">{error}</div>}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Attendance Checklist</h2>
            <p>{presentCount} present today</p>
          </div>
          <input className="date-input" type="date" value={classDate} onChange={event => setClassDate(event.target.value)} />
        </div>
        {loading ? <div className="empty">Loading students...</div> : students.map(student => {
          const row = rows[student.id]
          const after = student.current_lesson_count + (row?.present ? 1 : 0)
          const badge = lessonBadge(after)
          return (
            <div className="student-row" key={student.id}>
              <div className="row-main">
                <input className="checkbox" type="checkbox" checked={row?.present ?? false} onChange={event => patchRow(student.id, { present: event.target.checked })} />
                <button className="student-name" onClick={() => onOpenStudent(student.id)}>{student.name}</button>
                <div className="counts">Before {student.current_lesson_count}/4 · after {after}/4</div>
                <span className={`badge ${badge.tone}`}>{badge.text}</span>
              </div>
              {canRecordPayment(student.current_lesson_count) && <button className="small success-button" onClick={() => paid(student)}>Mark Paid</button>}
            </div>
          )
        })}
      </section>
      <section className="panel proof-panel">
        <h2>Class Proof</h2>
        <p>Upload one or more private group photos before saving attendance.</p>
        <input type="file" accept="image/*" multiple onChange={event => setClassFiles(Array.from(event.target.files ?? []))} />
        <button className="primary" onClick={submit} disabled={saving}>{saving ? 'Saving...' : 'Save Attendance'}</button>
        <div className="lesson-proof-list">
          <h3>Lesson Proofs</h3>
          {sessions.length === 0 ? (
            <div className="empty compact">No saved lessons yet.</div>
          ) : sessions.map(session => (
            <div className="lesson-proof-row" key={session.id}>
              <div className="lesson-proof-date">
                <strong>{dateLabel(session.class_date)}</strong>
                <span>{timeLabel(session.created_at)}</span>
              </div>
              <div className="lesson-proof-photos">
                {session.proof_photo_urls.length > 0
                  ? session.proof_photo_urls.map(path => <SignedImage key={path} path={path} label={`Class proof for ${dateLabel(session.class_date)}`} />)
                  : <span>No class photo</span>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function HistoryView({ onOpenStudent }: { onOpenStudent: (id: string) => void }) {
  const [sessions, setSessions] = useState<AttendanceSession[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getAttendanceHistory().then(setSessions).catch(err => setError(err.message ?? 'Could not load history.'))
  }, [])

  return (
    <div className="stack">
      {error && <div className="alert danger">{error}</div>}
      {sessions.length === 0 && <div className="empty panel">No attendance sessions yet.</div>}
      {sessions.map(item => {
        const records = item.records ?? []
        const present = records.filter(record => record.present).length
        return (
          <section className="panel session" key={item.id}>
            <button className="session-head" onClick={() => setOpenId(openId === item.id ? null : item.id)}>
              <span><strong>{dateLabel(item.class_date)}</strong><small>Created {timeLabel(item.created_at)} · {present}/{records.length} present</small></span>
              <b>{openId === item.id ? 'Hide' : 'View'}</b>
            </button>
            {openId === item.id && (
              <div className="session-body">
                <div className="proof-strip">
                  {item.proof_photo_urls.length ? item.proof_photo_urls.map(path => <SignedImage key={path} path={path} label="Class proof" />) : <span>No class proof photos.</span>}
                </div>
                {item.proof_notes && <p className="notes">{item.proof_notes}</p>}
                {records.map(record => <HistoryRecord key={record.id} record={record} onOpenStudent={onOpenStudent} />)}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function HistoryRecord({ record, onOpenStudent }: { record: AttendanceRecord; onOpenStudent: (id: string) => void }) {
  return (
    <div className="history-record">
      <div>
        <button className="student-name" onClick={() => onOpenStudent(record.student_id)}>{record.student?.name ?? 'Student'}</button>
        <p>{record.present ? 'Present' : 'Absent'} · {record.lesson_count_before}/4 to {record.lesson_count_after}/4</p>
        <p>Check-in {timeLabel(record.check_in_time)}</p>
      </div>
      <span className={`badge ${record.present ? 'good' : 'neutral'}`}>{record.present ? 'Present' : 'Absent'}</span>
      {record.student_proof_photo_url && <SignedImage path={record.student_proof_photo_url} label={`${record.student?.name ?? 'Student'} proof`} />}
      {record.proof_notes && <p className="notes">{record.proof_notes}</p>}
    </div>
  )
}

function StudentsView({ onOpenStudent }: { onOpenStudent: (id: string) => void }) {
  const [students, setStudents] = useState<Student[]>([])
  const [sessions, setSessions] = useState<AttendanceSession[]>([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [parentName, setParentName] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    load().catch(err => setError(err.message ?? 'Could not load students.'))
  }, [])

  async function load() {
    const [active, history] = await Promise.all([
      getActiveStudents(),
      getAttendanceHistory(),
    ])
    setStudents(active)
    setSessions(history)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')

    try {
      const student = await createStudent({ name, parentName, parentPhone, notes })
      setName('')
      setParentName('')
      setParentPhone('')
      setNotes('')
      setShowForm(false)
      await load()
      setNotice(`${student.name} added.`)
    } catch (err: any) {
      setError(err.message ?? 'Could not add student.')
    } finally {
      setSaving(false)
    }
  }

  function classDatesForStudent(studentId: string) {
    const slots: Record<number, string> = {}
    const records = sessions
      .flatMap(session => (session.records ?? []).map(record => ({ ...record, classDate: session.class_date })))
      .filter(record => record.student_id === studentId && record.present)
      .sort((a, b) => new Date(a.classDate).getTime() - new Date(b.classDate).getTime())

    records.forEach(record => {
      if (record.lesson_count_after >= 1 && record.lesson_count_after <= 4) {
        slots[record.lesson_count_after] = record.classDate
      }
    })

    return slots
  }

  return (
    <div className="stack">
      {notice && <div className="alert success">{notice}</div>}
      {error && <div className="alert danger">{error}</div>}
      <section className="panel student-form">
        <div className="panel-head">
          <div>
            <h2>Students</h2>
            <p>Add students first, then attendance dates populate Class 1-4 automatically.</p>
          </div>
          <button className="success-button" type="button" onClick={() => setShowForm(value => !value)}>
            {showForm ? 'Close' : 'Add Student'}
          </button>
        </div>
        {showForm && (
          <form onSubmit={submit}>
            <div className="form-grid">
              <label>Student name<input value={name} onChange={event => setName(event.target.value)} required /></label>
              <label>Parent name<input value={parentName} onChange={event => setParentName(event.target.value)} /></label>
              <label>Contact number<input value={parentPhone} onChange={event => setParentPhone(event.target.value)} inputMode="tel" /></label>
              <label className="full">Notes<textarea value={notes} onChange={event => setNotes(event.target.value)} rows={3} /></label>
            </div>
            <button className="primary form-submit" disabled={saving}>{saving ? 'Adding...' : 'Save Student'}</button>
          </form>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Class Roster</h2>
            <p>{students.length} students</p>
          </div>
        </div>
        {students.length === 0 ? <div className="empty">No students yet.</div> : (
          <div className="roster-table">
            <div className="roster-row roster-head">
              <span>Student</span>
              <span>Parent</span>
              <span>Contact</span>
              <span>Class 1</span>
              <span>Class 2</span>
              <span>Class 3</span>
              <span>Class 4</span>
            </div>
            {students.map(student => {
              const dates = classDatesForStudent(student.id)
              return (
                <div className="roster-row" key={student.id}>
                  <button className="student-name" onClick={() => onOpenStudent(student.id)}>{student.name}</button>
                  <span>{student.parent_name || '-'}</span>
                  <span>{student.parent_phone || '-'}</span>
                  {[1, 2, 3, 4].map(slot => (
                    <span key={slot}>{dates[slot] ? dateLabel(dates[slot]) : '-'}</span>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function StudentProfile({ studentId }: { studentId: string }) {
  const [student, setStudent] = useState<Student | null>(null)
  const [history, setHistory] = useState<StudentHistoryRecord[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([getStudent(studentId), getStudentHistory(studentId)])
      .then(([studentData, historyData]) => {
        setStudent(studentData)
        setHistory(historyData)
      })
      .catch(err => setError(err.message ?? 'Could not load student profile.'))
  }, [studentId])

  async function paid() {
    if (!student) return
    await markPaid(student.id)
    setStudent({ ...student, current_lesson_count: 0 })
  }

  return (
    <div className="stack">
      {error && <div className="alert danger">{error}</div>}
      {student && (
        <section className="panel profile-head">
          <div>
            <h2>{student.name}</h2>
            <p>{paymentStatus(student.current_lesson_count)}</p>
            {(student.parent_name || student.parent_phone) && (
              <p>{student.parent_name || 'Parent'}{student.parent_phone ? ` · ${student.parent_phone}` : ''}</p>
            )}
            {student.notes && <p>{student.notes}</p>}
          </div>
          {canRecordPayment(student.current_lesson_count) && <button className="success-button" onClick={paid}>Mark Paid</button>}
        </section>
      )}
      <section className="panel">
        <h2>Student Attendance History</h2>
        {history.map(record => {
          const hasProof = Boolean(record.student_proof_photo_url || record.session.proof_photo_urls.length)
          return (
            <div className="student-history" key={record.id}>
              <strong>{dateLabel(record.session.class_date)}</strong>
              <span>{record.present ? 'Present' : 'Absent'} · {record.lesson_count_before}/4 to {record.lesson_count_after}/4</span>
              <span>Proof {hasProof ? 'available' : 'not available'}</span>
              <span>Payment status then: {paymentStatus(record.lesson_count_after)}</span>
            </div>
          )
        })}
      </section>
    </div>
  )
}

export default function App() {
  const [view, setView] = useState<View>('attendance')
  const [studentId, setStudentId] = useState('')

  function openStudent(id: string) {
    setStudentId(id)
    setView('student')
  }

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <h1>Skating Attendance</h1>
          <p>Proof, lesson counts, and payments</p>
        </div>
      </header>
      <nav className="tabs">
        <button className={view === 'attendance' ? 'active' : ''} onClick={() => setView('attendance')}>Attendance</button>
        <button className={view === 'students' ? 'active' : ''} onClick={() => setView('students')}>Students</button>
        <button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}>History</button>
        {view === 'student' && <button className="active">Student</button>}
      </nav>
      {view === 'attendance' && <AttendanceView onOpenStudent={openStudent} />}
      {view === 'students' && <StudentsView onOpenStudent={openStudent} />}
      {view === 'history' && <HistoryView onOpenStudent={openStudent} />}
      {view === 'student' && studentId && <StudentProfile studentId={studentId} />}
    </main>
  )
}
