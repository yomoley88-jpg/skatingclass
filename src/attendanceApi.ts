export interface Student {
  id: string
  name: string
  active: boolean
  current_lesson_count: number
}

export interface AttendanceRecord {
  id: string
  session_id: string
  student_id: string
  present: boolean
  lesson_count_before: number
  lesson_count_after: number
  student_proof_photo_url: string | null
  proof_notes: string | null
  check_in_time: string
  created_at: string
  student?: Pick<Student, 'id' | 'name'>
}

export interface AttendanceSession {
  id: string
  class_date: string
  proof_photo_urls: string[]
  proof_notes: string | null
  marked_by: string | null
  created_at: string
  records?: AttendanceRecord[]
}

export interface StudentHistoryRecord extends AttendanceRecord {
  session: Pick<AttendanceSession, 'id' | 'class_date' | 'created_at' | 'proof_photo_urls'>
}

export interface StudentAttendanceInput {
  student: Student
  present: boolean
  proofFile: File | null
  proofNotes: string
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error ?? 'Request failed.')
  }

  return data as T
}

export async function getActiveStudents(): Promise<Student[]> {
  const data = await request<{ students: Student[] }>('/api/students')
  return data.students
}

export async function saveAttendance(params: {
  classDate: string
  classProofFiles: File[]
  proofNotes: string
  rows: StudentAttendanceInput[]
}) {
  const form = new FormData()
  form.set('payload', JSON.stringify({
    classDate: params.classDate,
    proofNotes: params.proofNotes,
    rows: params.rows.map(row => ({
      student: row.student,
      present: row.present,
      proofNotes: row.proofNotes,
    })),
  }))

  params.classProofFiles.forEach(file => form.append('classProofFiles', file))
  params.rows.forEach(row => {
    if (row.proofFile) form.append(`studentProof:${row.student.id}`, row.proofFile)
  })

  const data = await request<{ sessionId: string }>('/api/attendance', {
    method: 'POST',
    body: form,
  })

  return data.sessionId
}

export async function getAttendanceHistory(): Promise<AttendanceSession[]> {
  const data = await request<{ sessions: AttendanceSession[] }>('/api/attendance')
  return data.sessions
}

export async function getStudent(studentId: string): Promise<Student> {
  const data = await request<{ student: Student }>(`/api/student?id=${encodeURIComponent(studentId)}`)
  return data.student
}

export async function getStudentHistory(studentId: string): Promise<StudentHistoryRecord[]> {
  const data = await request<{ history: StudentHistoryRecord[] }>(`/api/student-history?id=${encodeURIComponent(studentId)}`)
  return data.history
}

export async function markPaid(studentId: string) {
  await request<{ ok: true }>('/api/mark-paid', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId }),
  })
}

export async function signedProofUrl(path: string) {
  const data = await request<{ signedUrl: string }>(`/api/proof-url?path=${encodeURIComponent(path)}`)
  return data.signedUrl
}
