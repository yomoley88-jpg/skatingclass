import { getSupabaseAdmin, json } from './_supabase'

export const config = { runtime: 'edge' }

export default async function handler(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return json(400, { error: 'Missing student id.' })

    const { data, error } = await getSupabaseAdmin()
      .from('students')
      .select('id,name,active,current_lesson_count')
      .eq('id', id)
      .single()

    if (error) throw error
    return json(200, { student: data })
  } catch (error: any) {
    return json(500, { error: error.message ?? 'Could not load student.' })
  }
}
