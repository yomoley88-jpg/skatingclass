import { getSupabaseAdmin, json, proofPaths } from './_supabase'

export const config = { runtime: 'edge' }

export default async function handler(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return json(400, { error: 'Missing student id.' })

    const { data, error } = await getSupabaseAdmin()
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
      .eq('student_id', id)
      .order('created_at', { ascending: false })

    if (error) throw error

    return json(200, {
      history: (data ?? []).map((record: any) => ({
        ...record,
        session: {
          ...record.session,
          proof_photo_urls: proofPaths(record.session?.proof_photo_urls),
        },
      })),
    })
  } catch (error: any) {
    return json(500, { error: error.message ?? 'Could not load student history.' })
  }
}
