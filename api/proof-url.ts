import { getSupabaseAdmin, json, PROOF_BUCKET } from './_supabase'

export const config = { runtime: 'edge' }

export default async function handler(request: Request) {
  try {
    const path = new URL(request.url).searchParams.get('path')
    if (!path) return json(400, { error: 'Missing proof path.' })

    const { data, error } = await getSupabaseAdmin().storage
      .from(PROOF_BUCKET)
      .createSignedUrl(path, 300)

    if (error) throw error
    return json(200, { signedUrl: data.signedUrl })
  } catch (error: any) {
    return json(500, { error: error.message ?? 'Could not create signed URL.' })
  }
}
