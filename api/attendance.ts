import {
  json,
  proofPaths,
  safeFileName,
  getSupabaseAdmin,
  uploadProof,
  PROOF_BUCKET,
} from './_supabase'

export const config = { runtime: 'edge' }

interface PayloadRow {
  student: { id: string; name: string; current_lesson_count: number }
  present: boolean
  proofNotes: string
}

export default async function handler(request: Request) {
  try {
    if (request.method === 'GET') return getHistory()
    if (request.method === 'POST') return createAttendance(request)
    return json(405, { error: 'Method not allowed.' })
  } catch (error: any) {
    return json(500, { error: error.message ?? 'Attendance request failed.' })
  }
}

async function getHistory() {
  const { data, error } = await getSupabaseAdmin()
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

  if (error) throw error

  return json(200, {
    sessions: (data ?? []).map((session: any) => ({
      ...session,
      proof_photo_urls: proofPaths(session.proof_photo_urls),
    })),
  })
}

async function createAttendance(request: Request) {
  const form = await request.formData()
  const payloadText = form.get('payload')
  if (typeof payloadText !== 'string') throw new Error('Missing attendance payload.')

  const payload = JSON.parse(payloadText) as {
    classDate: string
    proofNotes: string
    rows: PayloadRow[]
  }

  const sessionId = crypto.randomUUID()
  const uploaded: string[] = []

  try {
    const classFiles = form.getAll('classProofFiles').filter((item): item is File => item instanceof File)
    const classPaths = await Promise.all(classFiles.map((file, index) => {
      const path = `${sessionId}/class/${safeFileName(file, `class-${index + 1}`)}`
      uploaded.push(path)
      return uploadProof(file, path)
    }))

    const studentProofs = new Map<string, string>()
    await Promise.all(payload.rows.map(async row => {
      const file = form.get(`studentProof:${row.student.id}`)
      if (!(file instanceof File)) return

      const path = `${sessionId}/students/${row.student.id}/${safeFileName(file, row.student.name)}`
      uploaded.push(path)
      await uploadProof(file, path)
      studentProofs.set(row.student.id, path)
    }))

    const admin = getSupabaseAdmin()

    const { error: sessionError } = await admin.from('attendance_sessions').insert({
      id: sessionId,
      class_date: payload.classDate,
      proof_photo_urls: classPaths,
      proof_notes: payload.proofNotes?.trim() || null,
      marked_by: 'admin',
    })
    if (sessionError) throw sessionError

    const records = payload.rows.map(row => {
      const before = row.student.current_lesson_count
      const after = row.present ? before + 1 : before

      return {
        session_id: sessionId,
        student_id: row.student.id,
        present: row.present,
        lesson_count_before: before,
        lesson_count_after: after,
        student_proof_photo_url: studentProofs.get(row.student.id) ?? null,
        proof_notes: row.proofNotes?.trim() || null,
      }
    })

    const { error: recordsError } = await admin.from('attendance_records').insert(records)
    if (recordsError) throw recordsError

    await Promise.all(payload.rows.filter(row => row.present).map(row => {
      return admin
        .from('students')
        .update({ current_lesson_count: row.student.current_lesson_count + 1 })
        .eq('id', row.student.id)
    }))

    return json(200, { sessionId })
  } catch (error) {
    if (uploaded.length > 0) await getSupabaseAdmin().storage.from(PROOF_BUCKET).remove(uploaded)
    throw error
  }
}
