import { getSupabaseAdmin, json } from './_supabase'

export const config = { runtime: 'edge' }

export default async function handler() {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('students')
      .select('id,name,active,current_lesson_count')
      .eq('active', true)
      .order('name')

    if (error) throw error
    return json(200, { students: data ?? [] })
  } catch (error: any) {
    return json(500, { error: error.message ?? 'Could not load students.' })
  }
}
