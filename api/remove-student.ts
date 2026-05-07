import { getSupabaseAdmin, json } from './_supabase'

export const config = { runtime: 'edge' }

export default async function handler(request: Request) {
  try {
    if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' })
    const body = await request.json()
    if (!body.studentId) return json(400, { error: 'Missing student id.' })

    const { error } = await getSupabaseAdmin()
      .from('students')
      .update({ active: false })
      .eq('id', body.studentId)

    if (error) throw error
    return json(200, { ok: true })
  } catch (error: any) {
    return json(500, { error: error.message ?? 'Could not remove student.' })
  }
}
