import { getSupabaseAdmin, json } from './_supabase'

export const config = { runtime: 'edge' }

export default async function handler(request: Request) {
  try {
    if (request.method === 'POST') return createStudent(request)
    if (request.method !== 'GET') return json(405, { error: 'Method not allowed.' })

    const { data, error } = await getSupabaseAdmin()
      .from('students')
      .select('id,name,parent_name,parent_phone,notes,active,current_lesson_count')
      .eq('active', true)
      .order('name')

    if (error) throw error
    return json(200, { students: data ?? [] })
  } catch (error: any) {
    return json(500, { error: error.message ?? 'Could not load students.' })
  }
}

async function createStudent(request: Request) {
  const body = await request.json()
  const name = String(body.name ?? '').trim()
  if (!name) return json(400, { error: 'Student name is required.' })

  const currentLessonCount = Number(body.currentLessonCount ?? 0)

  const { data, error } = await getSupabaseAdmin()
    .from('students')
    .insert({
      name,
      parent_name: String(body.parentName ?? '').trim() || null,
      parent_phone: String(body.parentPhone ?? '').trim() || null,
      notes: String(body.notes ?? '').trim() || null,
      active: true,
      current_lesson_count: Number.isFinite(currentLessonCount) ? Math.max(0, currentLessonCount) : 0,
    })
    .select('id,name,parent_name,parent_phone,notes,active,current_lesson_count')
    .single()

  if (error) throw error
  return json(200, { student: data })
}
