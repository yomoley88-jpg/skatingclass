import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  getActiveStudents,
  getAttendanceHistory,
  getStudent,
  getStudentHistory,
  markPaid,
  saveAttendance,
  signIn,
  signOut,
  signedProofUrl,
  type AttendanceRecord,
  type AttendanceSession,
  type Student,
  type StudentHistoryRecord,
} from './attendanceApi'
import { isSupabaseConfigured, supabase } from './supabase'

type View = 'attendance' | 'history' | 'student'
type RowState = { present: boolean; proofFile: File | null; proofNotes: string; open: boolean }

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

function SignInView() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      await signIn(email, password)
    } catch (err: any) {
      setError(err.message ?? 'Could not sign in.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-screen">
      <form className="auth-panel" onSubmit={submit}>
        <h1>Skating Attendance</h1>
        <p>Admin sign-in for attendance proof and payment tracking.</p>
        {!isSupabaseConfigured && <div className="alert danger">Add Supabase env vars before signing in.</div>}
        {error && <div className="alert danger">{error}</div>}
        <label>Email<input value={email} onChange={event => setEmail(event.target.value)} type="email" required /></label>
        <label>Password<input value={password} onChange={event => setPassword(event.target.value)} type="password" required /></label>
        <button className="primary" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
      </form>
    </main>
  )
}

function AttendanceView({ session, onOpenStudent }: { session: Session; onOpenStudent: (id: string) => void }) {
  const [students, setStudents] = useState<Student[]>([])
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [classDate, setClassDate] = useState(today())
  const [classFiles, setClassFiles] = useState<File[]>([])
  const [proofNotes, setProofNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    load().catch(err => setError(err.message ?? 'Could not load students.'))
  }, [])

  async function load() {
    setLoading(true)
    const active = await getActiveStudents()
    setStudents(active)
    setRows(Object.fromEntries(active.map(student => [student.id, { present: false, proofFile: null, proofNotes: '', open: false }])))
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
        proofNotes,
        markedBy: session.user.id,
        rows: students.map(student => ({
          student,
          present: rows[student.id]?.present ?? false,
          proofFile: rows[student.id]?.proofFile ?? null,
          proofNotes: rows[student.id]?.proofNotes ?? '',
        })),
      })
      setClassFiles([])
      setProofNotes('')
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
              <button className="link-button" onClick={() => patchRow(student.id, { open: !row?.open })}>{row?.open ? 'Hide individual proof' : 'Add individual proof'}</button>
              {row?.open && (
                <div className="proof-fields">
                  <input type="file" accept="image/*" onChange={event => patchRow(student.id, { proofFile: event.target.files?.[0] ?? null })} />
                  <textarea value={row.proofNotes} onChange={event => patchRow(student.id, { proofNotes: event.target.value })} rows={2} placeholder="Optional student proof notes" />
                </div>
              )}
              {canRecordPayment(student.current_lesson_count) && <button className="small success-button" onClick={() => paid(student)}>Mark Paid</button>}
            </div>
          )
        })}
      </section>
      <section className="panel proof-panel">
        <h2>Class Proof</h2>
        <p>Upload one or more private group photos before saving attendance.</p>
        <input type="file" accept="image/*" multiple onChange={event => setClassFiles(Array.from(event.target.files ?? []))} />
        <textarea value={proofNotes} onChange={event => setProofNotes(event.target.value)} rows={3} placeholder="Proof notes for this class" />
        <button className="primary" onClick={submit} disabled={saving}>{saving ? 'Saving...' : 'Save Attendance'}</button>
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
  const [session, setSession] = useState<Session | null>(null)
  const [view, setView] = useState<View>('attendance')
  const [studentId, setStudentId] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => subscription.unsubscribe()
  }, [])

  if (!session) return <SignInView />

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
        <button className="ghost" onClick={signOut}>Sign Out</button>
      </header>
      <nav className="tabs">
        <button className={view === 'attendance' ? 'active' : ''} onClick={() => setView('attendance')}>Attendance</button>
        <button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}>History</button>
        {view === 'student' && <button className="active">Student</button>}
      </nav>
      {view === 'attendance' && <AttendanceView session={session} onOpenStudent={openStudent} />}
      {view === 'history' && <HistoryView onOpenStudent={openStudent} />}
      {view === 'student' && studentId && <StudentProfile studentId={studentId} />}
    </main>
  )
}
