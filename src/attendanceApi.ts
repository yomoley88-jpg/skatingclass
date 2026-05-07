import { supabase } from './supabase'

export const PROOF_BUCKET = 'attendance-proof'

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

function proofPaths(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function extension(file: File) {
  return file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
}

function safeName(file: File, fallback: string) {
  const stem = file.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || fallback.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  return `${stem}-${crypto.randomUUID()}.${extension(file)}`
}

async function uploadProof(file: File, path: string) {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image file.`)

  const { error } = await supabase.storage
    .from(PROOF_BUCKET)
    .upload(path, file, { contentType: file.type || undefined, cacheControl: '3600', upsert: false })

  if (error) throw new Error(`Proof photo upload failed: ${error.message}`)
  return path
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
}

export async function signOut() {
  await supabase.auth.signOut()
}

export async function getActiveStudents(): Promise<Student[]> {
  const { data, error } = await supabase
    .from('students')
    .select('id,name,active,current_lesson_count')
    .eq('active', true)
    .order('name')

  if (error) throw new Error(error.message)
  return (data ?? []) as Student[]
}

export async function saveAttendance(params: {
  classDate: string
  classProofFiles: File[]
  proofNotes: string
  markedBy: string | null
  rows: StudentAttendanceInput[]
}) {
  const sessionId = crypto.randomUUID()
  const uploaded: string[] = []

  try {
    const classPaths = await Promise.all(params.classProofFiles.map((file, index) => {
      const path = `${sessionId}/class/${safeName(file, `class-${index + 1}`)}`
      uploaded.push(path)
      return uploadProof(file, path)
    }))

    const studentProofs = new Map<string, string>()
    await Promise.all(params.rows.map(async row => {
      if (!row.proofFile) return
      const path = `${sessionId}/students/${row.student.id}/${safeName(row.proofFile, row.student.name)}`
      uploaded.push(path)
      await uploadProof(row.proofFile, path)
      studentProofs.set(row.student.id, path)
    }))

    const { error: sessionError } = await supabase.from('attendance_sessions').insert({
      id: sessionId,
      class_date: params.classDate,
      proof_photo_urls: classPaths,
      proof_notes: params.proofNotes.trim() || null,
      marked_by: params.markedBy,
    })
    if (sessionError) throw new Error(sessionError.message)

    const records = params.rows.map(row => {
      const before = row.student.current_lesson_count
      const after = row.present ? before + 1 : before
      return {
        session_id: sessionId,
        student_id: row.student.id,
        present: row.present,
        lesson_count_before: before,
        lesson_count_after: after,
        student_proof_photo_url: studentProofs.get(row.student.id) ?? null,
        proof_notes: row.proofNotes.trim() || null,
      }
    })

    const { error: recordsError } = await supabase.from('attendance_records').insert(records)
    if (recordsError) throw new Error(recordsError.message)

    await Promise.all(params.rows.filter(row => row.present).map(row => {
      return supabase
        .from('students')
        .update({ current_lesson_count: row.student.current_lesson_count + 1 })
        .eq('id', row.student.id)
    }))

    return sessionId
  } catch (error) {
    if (uploaded.length > 0) await supabase.storage.from(PROOF_BUCKET).remove(uploaded)
    throw error
  }
}

export async function getAttendanceHistory(): Promise<AttendanceSession[]> {
  const { data, error } = await supabase
    .from('attendance_sessions')
    .select(`
      id,
      class_date,
      proof_photo_urls,
      proof_notes,
      marked_by,
      created_at,
      records:attendance_records(
        id,
        session_id,
        student_id,
        present,
        lesson_count_before,
        lesson_count_after,
        student_proof_photo_url,
        proof_notes,
        check_in_time,
        created_at,
        student:students(id,name)
      )
    `)
    .order('class_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map((session: any) => ({
    ...session,
    proof_photo_urls: proofPaths(session.proof_photo_urls),
  })) as AttendanceSession[]
}

export async function getStudent(studentId: string): Promise<Student> {
  const { data, error } = await supabase
    .from('students')
    .select('id,name,active,current_lesson_count')
    .eq('id', studentId)
    .single()

  if (error) throw new Error(error.message)
  return data as Student
}

export async function getStudentHistory(studentId: string): Promise<StudentHistoryRecord[]> {
  const { data, error } = await supabase
    .from('attendance_records')
    .select(`
      id,
      session_id,
      student_id,
      present,
      lesson_count_before,
      lesson_count_after,
      student_proof_photo_url,
      proof_notes,
      check_in_time,
      created_at,
      session:attendance_sessions(id,class_date,created_at,proof_photo_urls)
    `)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map((record: any) => ({
    ...record,
    session: {
      ...record.session,
      proof_photo_urls: proofPaths(record.session?.proof_photo_urls),
    },
  })) as StudentHistoryRecord[]
}

export async function markPaid(studentId: string) {
  const { error } = await supabase
    .from('students')
    .update({ current_lesson_count: 0 })
    .eq('id', studentId)

  if (error) throw new Error(error.message)
}

export async function signedProofUrl(path: string) {
  const { data, error } = await supabase.storage.from(PROOF_BUCKET).createSignedUrl(path, 300)
  if (error) throw new Error(error.message)
  return data.signedUrl
}
